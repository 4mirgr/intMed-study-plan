import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest import mock
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("INTMED_PUBLISH_ENDPOINT", "https://example.test/functions/v1/publisher")
os.environ.setdefault("INTMED_DRAFT_ID", "45401591-deeb-4a31-b21a-743d09041e0f")
os.environ.setdefault("INTMED_PUBLISH_CAPABILITY", "a" * 64)
import publish_reviewed_content as subject


class LivePublicationTest(unittest.TestCase):
    def test_api_preserves_only_allowlisted_http_error_codes(self):
        allowed = ["hosting_actions_permission_required", "source_actions_permission_required",
                   "hosting_permission_required", "source_permission_required"]
        for status in (403, 503):
            for code in allowed:
                with self.subTest(status=status, code=code):
                    body = io.BytesIO(json.dumps({"code": code, "message": "synthetic-private-detail"}).encode())
                    blocked = urllib.error.HTTPError("https://example.test", status, "Forbidden", {}, body)
                    with mock.patch.object(subject.urllib.request, "urlopen", side_effect=blocked):
                        with self.assertRaises(subject.RunnerError) as error:
                            subject.api({"action": "validate"})
                    self.assertEqual(str(error.exception), "publisher_api_http_" + str(status) + ":" + code)
                    self.assertNotIn("synthetic-private-detail", str(error.exception))

    def test_api_suppresses_unknown_malformed_and_oversized_http_error_bodies(self):
        bodies = [b'{"code":"synthetic-private-code","message":"synthetic-private-detail"}',
                  b'synthetic-private-detail',
                  json.dumps({"message": "x" * 5000, "code": "hosting_permission_required"}).encode(),
                  b'{"code":["hosting_permission_required"],"message":"synthetic-private-detail"}']
        for status in (403, 503):
            for content in bodies:
                with self.subTest(status=status, body_size=len(content)):
                    body = io.BytesIO(content)
                    blocked = urllib.error.HTTPError("https://example.test", status, "Forbidden", {}, body)
                    with mock.patch.object(subject.urllib.request, "urlopen", side_effect=blocked):
                        with self.assertRaises(subject.RunnerError) as error:
                            subject.api({"action": "validate"})
                    self.assertEqual(str(error.exception), "publisher_api_http_" + str(status))
                    self.assertLessEqual(body.tell(), 4096)

    @mock.patch.object(subject, "verify_live_topic")
    @mock.patch.object(subject.subprocess, "run")
    @mock.patch.object(subject, "git")
    @mock.patch.object(subject, "integrate_publish_job")
    @mock.patch.object(subject, "api")
    def test_claims_integrates_pushes_verifies_and_completes(self, api, integrate, git, run, verify):
        job = {"draftId": subject.DRAFT_ID, "title": "عنوان", "target": {"topicId": "test"}}
        passed = {"ok": True, "state": "passed", "afterRunId": 0,
                  "run": {"id": 1, "attempt": 1, "status": "completed", "conclusion": "success"}}
        candidate = {**passed, "rootBase": "b" * 40, "hostingCommit": "c" * 40, "mode": "candidate"}
        api.side_effect = [{"job": job}, passed, candidate, {"ok": True}, passed, {"ok": True}]
        run.return_value.returncode = 1
        def git_result(*args):
            if args == ("rev-parse", "HEAD"):
                return "a" * 40
            if args[:2] == ("ls-remote", "--refs"):
                return "a" * 40 + "\t" + args[-1]
            return ""
        git.side_effect = git_result
        self.assertEqual(subject.main(), 0)
        integrate.assert_called_once_with({"supabase_url": "https://api.drgerami-md.ir"}, job)
        verify.assert_called_once_with("test")
        self.assertEqual(api.call_args_list[-1].args[0]["commit"], "a" * 40)
        self.assertTrue(api.call_args_list[-1].args[0]["ok"])
        self.assertEqual([call.args[0]["action"] for call in api.call_args_list],
                         ["claim", "validate", "prepare_deploy", "deploy", "deployment_status", "result"])
        self.assertEqual(api.call_args_list[-1].args[0]["hostingCommit"], "c" * 40)

    @mock.patch.object(subject, "api")
    def test_reports_failure_to_same_draft(self, api):
        api.side_effect = [RuntimeError("boom"), {"ok": True}]
        self.assertEqual(subject.main(), 1)
        self.assertFalse(api.call_args_list[-1].args[0]["ok"])
        self.assertEqual(api.call_args_list[-1].args[0]["draftId"], subject.DRAFT_ID)

    def test_does_not_accept_manifest_without_matching_payload(self):
        payload = b'{"lesson":["new"]}\n'
        entry = {"sha256": hashlib.sha256(payload).hexdigest(), "path": "content/topics/test.json"}
        manifest = {"topics": {"test": entry}}
        def response(data):
            value = mock.MagicMock()
            value.__enter__.return_value = io.BytesIO(data)
            return value
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "docs/content/manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(manifest), encoding="utf-8")
            results = [response(json.dumps(manifest).encode()), response(b'old'),
                       response(json.dumps(manifest).encode()), response(payload)]
            def fetch_mounted(request, **kwargs):
                if not request.full_url.startswith("https://drgerami-md.ir/intmed/content/"):
                    raise OSError("HTTP 404: application moved to /intmed/")
                return results.pop(0)
            with mock.patch.object(subject, "ROOT", folder), \
                 mock.patch.object(subject.urllib.request, "urlopen", side_effect=fetch_mounted) as opened, \
                 mock.patch.object(subject.time, "sleep") as waited:
                subject.verify_live_topic("test", timeout=1)
            self.assertEqual(opened.call_count, 4)
            waited.assert_called_once_with(5)
            for call in opened.call_args_list:
                self.assertEqual(call.args[0].get_header("User-agent"), "IntMed-Publisher/1.0")
                self.assertEqual(call.args[0].get_header("Accept"), "application/json")

    def test_timeout_is_not_reported_as_published(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "docs/content/manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"topics": {"test": {"sha256": "new"}}}), encoding="utf-8")
            with mock.patch.object(subject, "ROOT", folder), \
                 mock.patch.object(subject.urllib.request, "urlopen", side_effect=OSError("offline")):
                with self.assertRaisesRegex(subject.RunnerError, "GitHub"):
                    subject.verify_live_topic("test", timeout=0)

    def test_public_http_error_is_diagnosed_without_leaking_body(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "docs/content/manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"topics": {"test": {"sha256": "new"}}}), encoding="utf-8")
            blocked = urllib.error.HTTPError("https://public.example/manifest.json", 403, "Forbidden", {}, io.BytesIO(b"private error body must not be logged"))
            with mock.patch.object(subject, "ROOT", folder), mock.patch.object(subject.urllib.request, "urlopen", side_effect=blocked):
                with self.assertRaisesRegex(subject.RunnerError, "manifest_http_403") as error:
                    subject.verify_live_topic("test", timeout=0)
            self.assertNotIn("private error body", str(error.exception))


class WorkflowCapabilityMaskTest(unittest.TestCase):
    def test_capability_is_masked_from_event_before_checkout_or_step_environment(self):
        workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/publish-content.yml").read_text("utf-8")
        step = re.search(r"(?ms)^      - name: Mask publication capability\n(.*?)(?=^      - |\Z)", workflow)
        self.assertIsNotNone(step, "Mask the workflow input before GitHub prints any capability-bearing step environment")
        self.assertLess(step.start(), workflow.index("      - uses: actions/checkout"))
        self.assertLess(step.start(), workflow.index("INTMED_PUBLISH_CAPABILITY:"))
        self.assertNotIn("${{", step.group(1))
        self.assertNotIn("env:", step.group(1))
        script = textwrap.dedent(step.group(1).split("        run: |\n", 1)[1])
        with tempfile.TemporaryDirectory() as folder:
            event = Path(folder) / "event.json"
            synthetic = "1234abcd" * 8
            event.write_text(json.dumps({"inputs": {"capability": synthetic}}), "utf-8")
            result = subprocess.run(["bash", "-e", "-c", script], capture_output=True, text=True,
                env={"PATH": os.environ["PATH"], "GITHUB_EVENT_PATH": str(event)})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "::add-mask::" + synthetic + "\n")
            event.write_text(json.dumps({"inputs": {"capability": "malformed\n::warning::injected"}}), "utf-8")
            invalid = subprocess.run(["bash", "-e", "-c", script], capture_output=True, text=True,
                env={"PATH": os.environ["PATH"], "GITHUB_EVENT_PATH": str(event)})
            self.assertNotEqual(invalid.returncode, 0)
            self.assertNotIn("injected", invalid.stdout + invalid.stderr)


class TrustedPublisherTest(unittest.TestCase):
    def setUp(self):
        self.commit, self.root_base, self.hosting = "a" * 40, "b" * 40, "c" * 40
        self.events, self.remote_tags = [], {}
        self.now = 0.0
        self.source_status = [{"ok": True, "state": "passed", "afterRunId": 10, "run": self.ci_run(11)}]
        self.root_status = [{"ok": True, "state": "passed", "afterRunId": 20, "run": self.ci_run(21)},
                            {"ok": True, "state": "waiting", "afterRunId": 0,
                             "run": self.ci_run(22, "in_progress", None)},
                            {"ok": True, "state": "passed", "afterRunId": 0, "run": self.ci_run(22)}]
        self.job = {"draftId": subject.DRAFT_ID, "title": "Synthetic reviewed draft", "target": {"topicId": "synthetic"}}
        for target, replacement in [("api", self.call_api), ("git", self.call_git),
                ("integrate_publish_job", lambda *_: self.events.append("integrate")),
                ("verify_live_topic", self.verify)]:
            patch = mock.patch.object(subject, target, side_effect=replacement)
            patch.start()
            self.addCleanup(patch.stop)
        for target, replacement in [("monotonic", lambda: self.now), ("sleep", self.sleep)]:
            patch = mock.patch.object(subject.time, target, side_effect=replacement)
            patch.start()
            self.addCleanup(patch.stop)
        patch = mock.patch.object(subject.subprocess, "run", return_value=mock.Mock(returncode=1))
        patch.start()
        self.addCleanup(patch.stop)

    @staticmethod
    def ci_run(run_id, status="completed", conclusion="success"):
        return {"id": run_id, "attempt": 1, "status": status, "conclusion": conclusion,
                "url": "https://github.test/actions/runs/" + str(run_id)}

    def sleep(self, seconds):
        self.events.append(("sleep", seconds))
        self.now += seconds

    def verify(self, topic_id):
        self.events.append(("verify", topic_id))

    def call_git(self, *args, **kwargs):
        self.events.append(("git", args))
        if args == ("rev-parse", "HEAD"):
            return self.commit
        if args[:2] == ("ls-remote", "--refs"):
            ref = args[-1]
            return self.remote_tags[ref] + "\t" + ref if ref in self.remote_tags else ""
        if args[:2] == ("push", "origin") and ":refs/tags/" in args[2]:
            sha, ref = args[2].split(":", 1)
            if ref in self.remote_tags and self.remote_tags[ref] != sha:
                raise subject.RunnerError("immutable tag collision")
            self.remote_tags[ref] = sha
        return ""

    def call_api(self, payload, **kwargs):
        self.events.append(("api", dict(payload), kwargs))
        action = payload["action"]
        if action == "claim":
            return {"job": self.job}
        if action == "validate":
            return {"ok": True, "state": "waiting", "afterRunId": 10, "run": None}
        if action == "validation_status":
            return self.source_status.pop(0)
        if action == "prepare_deploy":
            return {"ok": True, "state": "waiting", "afterRunId": 20, "run": None,
                    "rootBase": self.root_base, "hostingCommit": self.hosting, "mode": "candidate"}
        if action == "deployment_status":
            return self.root_status.pop(0)
        return {"ok": True}

    def api_calls(self, action=None):
        return [event[1] for event in self.events if isinstance(event, tuple) and event[0] == "api"
                and (action is None or event[1]["action"] == action)]

    def assert_no_deploy_or_success(self):
        self.assertEqual(self.api_calls("deploy"), [])
        self.assertFalse(self.api_calls("result")[-1]["ok"])

    def test_exact_source_and_root_ci_precede_deploy_and_postdeploy_ci_precedes_success(self):
        self.assertEqual(subject.main(), 0)
        self.assertEqual([row["action"] for row in self.api_calls()], ["claim", "validate", "validation_status",
            "prepare_deploy", "deployment_status", "deploy", "deployment_status", "deployment_status", "result"])
        tag = "refs/tags/intmed-release-check-" + self.commit
        self.assertEqual(self.remote_tags, {tag: self.commit})
        tag_push = ("git", ("push", "origin", self.commit + ":" + tag))
        self.assertLess(self.events.index(tag_push), next(index for index, event in enumerate(self.events)
            if isinstance(event, tuple) and event[0] == "api" and event[1]["action"] == "validate"))
        self.assertEqual(self.api_calls("validation_status")[0]["afterRunId"], 10)
        self.assertEqual([row["afterRunId"] for row in self.api_calls("deployment_status")], [20, 0, 0])
        result = self.api_calls("result")[-1]
        self.assertEqual((result["commit"], result["rootBase"], result["hostingCommit"]),
                         (self.commit, self.root_base, self.hosting))
        verify_index = self.events.index(("verify", "synthetic"))
        self.assertLess(verify_index, next(index for index, event in enumerate(self.events)
            if isinstance(event, tuple) and event[0] == "api" and event[1]["action"] == "deployment_status"
            and event[1]["afterRunId"] == 0))

    def test_stale_success_cannot_authorize_deploy(self):
        self.source_status[0]["run"] = self.ci_run(9)
        self.assertEqual(subject.main(), 1)
        self.assert_no_deploy_or_success()

    def test_newest_ci_failure_cannot_authorize_deploy(self):
        self.source_status[0].update({"state": "failed", "run": self.ci_run(11, conclusion="failure")})
        self.assertEqual(subject.main(), 1)
        self.assert_no_deploy_or_success()

    def test_existing_release_tag_at_another_commit_is_never_moved(self):
        tag = "refs/tags/intmed-release-check-" + self.commit
        self.remote_tags[tag] = "d" * 40
        self.assertEqual(subject.main(), 1)
        self.assertEqual(self.remote_tags[tag], "d" * 40)
        self.assertEqual(self.api_calls("validate"), [])
        self.assert_no_deploy_or_success()

    def test_source_and_root_waits_share_one_budget(self):
        def delayed_source(payload, **kwargs):
            if payload["action"] == "validation_status":
                self.now = 719.0
            if payload["action"] == "deployment_status":
                self.events.append(("api", dict(payload), kwargs))
                return {"ok": True, "state": "waiting", "afterRunId": 20, "run": None}
            return self.call_api(payload, **kwargs)
        with mock.patch.object(subject, "api", side_effect=delayed_source):
            self.assertEqual(subject.main(), 1)
        self.assertLessEqual(self.now, 720.0)
        self.assert_no_deploy_or_success()

    def test_http_timeout_is_bounded_to_fractional_remaining_ci_budget(self):
        self.root_status = [{"ok": True, "state": "passed", "afterRunId": 0, "run": self.ci_run(22)}]
        def nearly_expired_source(payload, **kwargs):
            if payload["action"] == "validation_status":
                self.now = 719.75
            result = self.call_api(payload, **kwargs)
            if payload["action"] == "prepare_deploy":
                result.update({"state": "passed", "run": self.ci_run(21)})
            return result
        with mock.patch.object(subject, "api", side_effect=nearly_expired_source):
            self.assertEqual(subject.main(), 0)
        prepared = next(event for event in self.events if isinstance(event, tuple)
                        and event[0] == "api" and event[1]["action"] == "prepare_deploy")
        self.assertLessEqual(prepared[2]["timeout"], 0.25)

    def test_immediate_pass_is_accepted_after_ci_budget_expires(self):
        self.root_status = [{"ok": True, "state": "passed", "afterRunId": 20, "run": self.ci_run(21)},
                            {"ok": True, "state": "passed", "afterRunId": 0, "run": self.ci_run(22)}]
        def expire_after_deploy(payload, **kwargs):
            result = self.call_api(payload, **kwargs)
            if payload["action"] == "deploy":
                self.now = 721.0
            return result
        with mock.patch.object(subject, "api", side_effect=expire_after_deploy):
            self.assertEqual(subject.main(), 0)
        self.assertTrue(self.api_calls("result")[-1]["ok"])

    def test_public_propagation_does_not_spend_ci_wait_budget(self):
        def slow_public(_topic):
            self.now += 480.0
        def mostly_spent_ci(payload, **kwargs):
            result = self.call_api(payload, **kwargs)
            if payload["action"] == "deploy":
                self.now = 710.0
            return result
        with mock.patch.object(subject, "verify_live_topic", side_effect=slow_public), \
             mock.patch.object(subject, "api", side_effect=mostly_spent_ci):
            self.assertEqual(subject.main(), 0)
        self.assertTrue(self.api_calls("result")[-1]["ok"])

    def test_existing_correct_release_tag_is_reused_without_writing_it(self):
        tag = "refs/tags/intmed-release-check-" + self.commit
        self.remote_tags[tag] = self.commit
        self.assertEqual(subject.main(), 0)
        self.assertFalse(any(event[0] == "git" and event[1][:2] == ("push", "origin")
            and ":refs/tags/" in event[1][-1] for event in self.events if isinstance(event, tuple)))

    def test_root_ci_failure_never_deploys(self):
        self.root_status[0].update({"state": "failed", "run": self.ci_run(21, conclusion="failure")})
        self.assertEqual(subject.main(), 1)
        self.assert_no_deploy_or_success()

    def test_public_verification_failure_never_reports_success(self):
        with mock.patch.object(subject, "verify_live_topic", side_effect=subject.RunnerError("manifest_hash_mismatch")):
            self.assertEqual(subject.main(), 1)
        self.assertEqual(len(self.api_calls("deploy")), 1)
        self.assertFalse(self.api_calls("result")[-1]["ok"])

    def test_pending_postdeploy_ci_never_reports_success(self):
        def expire_after_deploy(payload, **kwargs):
            result = self.call_api(payload, **kwargs)
            if payload["action"] == "deploy":
                self.now = 720.0
            return result
        with mock.patch.object(subject, "api", side_effect=expire_after_deploy):
            self.assertEqual(subject.main(), 1)
        self.assertEqual(len(self.api_calls("deploy")), 1)
        self.assertFalse(self.api_calls("result")[-1]["ok"])


if __name__ == "__main__":
    unittest.main()
