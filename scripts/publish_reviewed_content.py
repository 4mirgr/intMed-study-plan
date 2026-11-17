#!/usr/bin/env python3
"""Publish one reviewed draft inside GitHub Actions using a one-time capability."""
from __future__ import annotations

import json
import hashlib
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

from local_runner import RunnerError, integrate_publish_job

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINT = os.environ.get("INTMED_PUBLISH_ENDPOINT", "").rstrip("/")
DRAFT_ID = os.environ.get("INTMED_DRAFT_ID", "")
CAPABILITY = os.environ.get("INTMED_PUBLISH_CAPABILITY", "")
BRANCH = "claude/quirky-ride-mavb6b"
PUBLIC_APP_BASE = "https://drgerami-md.ir/intmed/"
PUBLIC_HEADERS = {"Cache-Control": "no-cache", "Accept": "application/json",
                  "User-Agent": "IntMed-Publisher/1.0"}
CI_WAIT_SECONDS = 12 * 60
SAFE_API_ERROR_CODES = frozenset({
    "hosting_actions_permission_required", "source_actions_permission_required",
    "hosting_permission_required", "source_permission_required",
})


def verify_live_topic(topic_id: str, *, timeout: int = 480) -> None:
    """Do not report publication until both public index and payload match this build."""
    with open(os.path.join(ROOT, "docs/content/manifest.json"), encoding="utf-8") as handle:
        expected = json.load(handle)["topics"][topic_id]
    deadline = time.monotonic() + timeout
    last_issue, reported = "verification_not_started", None
    while True:
        phase = "manifest"
        try:
            suffix = "?publication=" + str(time.time_ns())
            request = urllib.request.Request(PUBLIC_APP_BASE + "content/manifest.json" + suffix,
                                             headers=PUBLIC_HEADERS)
            with urllib.request.urlopen(request, timeout=20) as response:
                manifest = json.load(response)
            if manifest.get("topics", {}).get(topic_id, {}).get("sha256") == expected["sha256"]:
                phase = "payload"
                # Use the locally generated path, never a URL supplied by a remote response.
                request = urllib.request.Request(PUBLIC_APP_BASE + expected["path"] + suffix,
                                                 headers=PUBLIC_HEADERS)
                with urllib.request.urlopen(request, timeout=20) as response:
                    digest = hashlib.sha256(response.read()).hexdigest()
                if digest == expected["sha256"]:
                    return
                last_issue = "payload_hash_mismatch"
            else:
                last_issue = "manifest_hash_mismatch"
        except urllib.error.HTTPError as error:
            last_issue = phase + "_http_" + str(error.code)
        except (OSError, ValueError, KeyError):
            last_issue = phase + "_network_or_invalid_json"
        if last_issue != reported:
            print("Public verification:", last_issue, flush=True)
            reported = last_issue
        if time.monotonic() >= deadline:
            raise RunnerError("تغییرات در GitHub ثبت شد اما تأیید نمایش نسخهٔ جدید روی سایت به پایان نرسید؛ انتشار را دوباره بررسی کنید. (" + last_issue + ")")
        time.sleep(5)


def api(payload: dict, *, timeout: float = 120) -> dict:
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        safe_code = ""
        try:
            detail = json.loads(exc.read(4096))
            code = detail.get("code") if isinstance(detail, dict) else None
            if isinstance(code, str) and code in SAFE_API_ERROR_CODES:
                safe_code = ":" + code
        except (OSError, ValueError):
            pass
        raise RunnerError(f"publisher_api_http_{exc.code}{safe_code}") from None
    except (OSError, ValueError):
        raise RunnerError("publisher_api_network_or_invalid_json") from None
    if not isinstance(result, dict):
        raise RunnerError("publisher API returned invalid JSON")
    return result


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    if check and result.returncode:
        raise RunnerError("git failed: " + result.stdout.strip()[-900:])
    return result.stdout.strip()


def ensure_source_validation_tag(commit: str) -> None:
    """Create an immutable lightweight ref; dispatch authority belongs to the server."""
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RunnerError("publisher_invalid_source_commit")
    ref = "refs/tags/intmed-release-check-" + commit

    def remote_commit() -> str:
        value = git("ls-remote", "--refs", "origin", ref)
        if not value:
            return ""
        parts = value.split()
        if len(parts) != 2 or parts[1] != ref:
            raise RunnerError("publisher_invalid_release_tag")
        return parts[0]

    existing = remote_commit()
    if existing and existing != commit:
        raise RunnerError("publisher_release_tag_collision")
    if not existing:
        try:
            git("push", "origin", commit + ":" + ref)
        except RunnerError:
            # A concurrent same-commit publication may have created the same ref.
            if remote_commit() != commit:
                raise
        if remote_commit() != commit:
            raise RunnerError("publisher_release_tag_not_verified")


def ci_timeout(deadline: float) -> float:
    # Still permit one immediate status check at the boundary: a completed run
    # can pass even after the waiting budget is exhausted.
    remaining = deadline - time.monotonic()
    return min(120.0, remaining) if remaining > 0 else 1.0


def wait_for_ci(response: dict, action: str, context: dict, deadline: float) -> None:
    """Poll an existing exact-commit validation. Never dispatch while waiting."""
    floor = response.get("afterRunId")
    if not isinstance(floor, int) or isinstance(floor, bool) or floor < 0:
        raise RunnerError(action + "_invalid_run_floor")
    while True:
        state = response.get("state")
        if response.get("ok") is not True or state not in {"waiting", "passed", "failed"}:
            raise RunnerError(action + "_invalid_response")
        if state == "passed":
            run = response.get("run")
            if (not isinstance(run, dict) or not isinstance(run.get("id"), int)
                    or isinstance(run["id"], bool) or run["id"] <= floor
                    or run.get("status") != "completed" or run.get("conclusion") != "success"):
                raise RunnerError(action + "_invalid_or_stale_success")
            return
        if state == "failed":
            raise RunnerError(action + "_ci_failed")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RunnerError(action + "_ci_wait_timeout")
        # Each status action verifies several repository proofs; avoid doubling
        # GitHub API traffic for negligible latency during multi-minute CI runs.
        time.sleep(min(10.0, remaining))
        response = api({**context, "action": action, "afterRunId": floor}, timeout=ci_timeout(deadline))


def main() -> int:
    if not ENDPOINT.startswith("https://") or not DRAFT_ID or len(CAPABILITY) != 64:
        print("Publisher environment is incomplete.", file=sys.stderr)
        return 2
    try:
        claimed = api({"action": "claim", "draftId": DRAFT_ID, "capability": CAPABILITY})
        job = claimed.get("job")
        if not isinstance(job, dict):
            raise RunnerError("cloud publisher returned no job")
        integrate_publish_job({"supabase_url": "https://api.drgerami-md.ir"}, job)
        git("add", "content", "docs")
        changed = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode != 0
        if changed:
            git("config", "user.name", "intmed-publisher[bot]")
            git("config", "user.email", "publisher@intmed.local")
            git("commit", "-m", "Publish reviewed content: " + str(job.get("title") or DRAFT_ID)[:100])
        commit = git("rev-parse", "HEAD")
        git("push", "origin", "HEAD:" + BRANCH)
        ensure_source_validation_tag(commit)
        context = {"draftId": DRAFT_ID, "capability": CAPABILITY, "commit": commit}
        ci_deadline = time.monotonic() + CI_WAIT_SECONDS
        validation = api({**context, "action": "validate"}, timeout=ci_timeout(ci_deadline))
        wait_for_ci(validation, "validation_status", context, ci_deadline)
        prepared = api({**context, "action": "prepare_deploy"}, timeout=ci_timeout(ci_deadline))
        root_base, hosting_commit = prepared.get("rootBase"), prepared.get("hostingCommit")
        if (not isinstance(root_base, str) or not re.fullmatch(r"[0-9a-f]{40}", root_base)
                or not isinstance(hosting_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", hosting_commit)
                or prepared.get("mode") not in {"candidate", "already_current"}):
            raise RunnerError("publisher_invalid_hosting_candidate")
        deployment_context = {**context, "rootBase": root_base, "hostingCommit": hosting_commit}
        wait_for_ci(prepared, "deployment_status", deployment_context, ci_deadline)
        deployed = api({**deployment_context, "action": "deploy"})
        if deployed.get("ok") is not True:
            raise RunnerError("publisher_deploy_not_accepted")
        public_started = time.monotonic()
        verify_live_topic(str(job.get("target", {}).get("topicId") or ""))
        # Public CDN propagation has its own eight-minute budget.
        ci_deadline += time.monotonic() - public_started
        post_deploy = api({**deployment_context, "action": "deployment_status", "afterRunId": 0},
                          timeout=ci_timeout(ci_deadline))
        wait_for_ci(post_deploy, "deployment_status", deployment_context, ci_deadline)
        completed = api({**deployment_context, "action": "result", "ok": True})
        if completed.get("ok") is not True:
            raise RunnerError("publisher_completion_not_accepted")
        print("Published", DRAFT_ID, commit)
        return 0
    except Exception as exc:
        message = str(exc)[:1000]
        try:
            api({"action": "result", "draftId": DRAFT_ID, "capability": CAPABILITY,
                 "ok": False, "error": message})
        except Exception:
            pass
        print(message, file=sys.stderr)
        return 1


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--verify-topic":
        # Read-only production diagnostic: no claim, token, queue or Git write.
        try:
            verify_live_topic(sys.argv[2], timeout=0)
        except (RunnerError, KeyError) as error:
            print(str(error), file=sys.stderr)
            raise SystemExit(1)
        raise SystemExit(0)
    raise SystemExit(main())
