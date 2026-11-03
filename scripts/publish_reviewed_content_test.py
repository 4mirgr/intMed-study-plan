import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("INTMED_PUBLISH_ENDPOINT", "https://example.test/functions/v1/publisher")
os.environ.setdefault("INTMED_DRAFT_ID", "45401591-deeb-4a31-b21a-743d09041e0f")
os.environ.setdefault("INTMED_PUBLISH_CAPABILITY", "a" * 64)
import publish_reviewed_content as subject


class LivePublicationTest(unittest.TestCase):
    @mock.patch.object(subject, "verify_live_topic")
    @mock.patch.object(subject.subprocess, "run")
    @mock.patch.object(subject, "git")
    @mock.patch.object(subject, "integrate_publish_job")
    @mock.patch.object(subject, "api")
    def test_claims_integrates_pushes_verifies_and_completes(self, api, integrate, git, run, verify):
        job = {"draftId": subject.DRAFT_ID, "title": "عنوان", "target": {"topicId": "test"}}
        api.side_effect = [{"job": job}, {"ok": True}]
        run.return_value.returncode = 1
        git.side_effect = ["", "", "", "", "abc123", ""]
        self.assertEqual(subject.main(), 0)
        integrate.assert_called_once_with({"supabase_url": "https://api.drgerami-md.ir"}, job)
        verify.assert_called_once_with("test")
        self.assertEqual(api.call_args_list[-1].args[0]["commit"], "abc123")
        self.assertTrue(api.call_args_list[-1].args[0]["ok"])

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
            with mock.patch.object(subject, "ROOT", folder), \
                 mock.patch.object(subject.urllib.request, "urlopen", side_effect=results) as opened, \
                 mock.patch.object(subject.time, "sleep") as waited:
                subject.verify_live_topic("test")
            self.assertEqual(opened.call_count, 4)
            waited.assert_called_once_with(5)

    def test_timeout_is_not_reported_as_published(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "docs/content/manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"topics": {"test": {"sha256": "new"}}}), encoding="utf-8")
            with mock.patch.object(subject, "ROOT", folder), \
                 mock.patch.object(subject.urllib.request, "urlopen", side_effect=OSError("offline")):
                with self.assertRaisesRegex(subject.RunnerError, "GitHub"):
                    subject.verify_live_topic("test", timeout=0)


if __name__ == "__main__":
    unittest.main()
