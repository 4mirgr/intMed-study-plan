#!/usr/bin/env python3
"""Publish one reviewed draft inside GitHub Actions using a one-time capability."""
from __future__ import annotations

import json
import hashlib
import os
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


def verify_live_topic(topic_id: str, *, timeout: int = 480) -> None:
    """Do not report publication until both public index and payload match this build."""
    with open(os.path.join(ROOT, "docs/content/manifest.json"), encoding="utf-8") as handle:
        expected = json.load(handle)["topics"][topic_id]
    deadline = time.monotonic() + timeout
    while True:
        try:
            suffix = "?publication=" + str(time.time_ns())
            request = urllib.request.Request(PUBLIC_APP_BASE + "content/manifest.json" + suffix,
                                             headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(request, timeout=20) as response:
                manifest = json.load(response)
            if manifest.get("topics", {}).get(topic_id, {}).get("sha256") == expected["sha256"]:
                # Use the locally generated path, never a URL supplied by a remote response.
                request = urllib.request.Request(PUBLIC_APP_BASE + expected["path"] + suffix,
                                                 headers={"Cache-Control": "no-cache"})
                with urllib.request.urlopen(request, timeout=20) as response:
                    digest = hashlib.sha256(response.read()).hexdigest()
                if digest == expected["sha256"]:
                    return
        except (OSError, ValueError, KeyError):
            pass
        if time.monotonic() >= deadline:
            raise RunnerError("تغییرات در GitHub ثبت شد اما تأیید نمایش نسخهٔ جدید روی سایت به پایان نرسید؛ انتشار را دوباره بررسی کنید.")
        time.sleep(5)


def api(payload: dict) -> dict:
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:800]
        raise RunnerError(f"publisher API HTTP {exc.code}: {detail}") from None
    if not isinstance(result, dict):
        raise RunnerError("publisher API returned invalid JSON")
    return result


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    if check and result.returncode:
        raise RunnerError("git failed: " + result.stdout.strip()[-900:])
    return result.stdout.strip()


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
        verify_live_topic(str(job.get("target", {}).get("topicId") or ""))
        api({"action": "result", "draftId": DRAFT_ID, "capability": CAPABILITY,
             "ok": True, "commit": commit})
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
    raise SystemExit(main())
