#!/usr/bin/env python3
import os
import unittest
from unittest import mock

os.environ.setdefault("INTMED_PUBLISH_ENDPOINT", "https://example.test/functions/v1/publisher")
os.environ.setdefault("INTMED_DRAFT_ID", "45401591-deeb-4a31-b21a-743d09041e0f")
os.environ.setdefault("INTMED_PUBLISH_CAPABILITY", "a" * 64)

import publish_reviewed_content as publisher


class PublishReviewedContentTest(unittest.TestCase):
    @mock.patch.object(publisher.subprocess, "run")
    @mock.patch.object(publisher, "git")
    @mock.patch.object(publisher, "integrate_publish_job")
    @mock.patch.object(publisher, "api")
    def test_claims_integrates_pushes_and_completes(self, api, integrate, git, run):
        job = {"draftId": publisher.DRAFT_ID, "title": "عنوان"}
        api.side_effect = [{"job": job}, {"ok": True}]
        run.return_value.returncode = 1
        git.side_effect = ["", "", "", "", "abc123", ""]

        self.assertEqual(publisher.main(), 0)
        integrate.assert_called_once_with({"supabase_url": "https://api.drgerami-md.ir"}, job)
        self.assertEqual(api.call_args_list[-1].args[0]["commit"], "abc123")
        self.assertTrue(api.call_args_list[-1].args[0]["ok"])

    @mock.patch.object(publisher, "api")
    def test_reports_failure_to_same_draft(self, api):
        api.side_effect = [RuntimeError("boom"), {"ok": True}]
        self.assertEqual(publisher.main(), 1)
        self.assertFalse(api.call_args_list[-1].args[0]["ok"])
        self.assertEqual(api.call_args_list[-1].args[0]["draftId"], publisher.DRAFT_ID)


if __name__ == "__main__":
    unittest.main()
