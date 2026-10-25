#!/usr/bin/env python3
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_preflight as subject


class ReleasePreflightTest(unittest.TestCase):
    def test_remote_reports_names_and_jwt_without_values(self):
        fixtures = {
            f"/v1/projects/{subject.PROJECT_REF}/secrets": [{"name": name, "value": "must-not-leak"} for name in subject.REQUIRED_SECRETS | subject.OPTIONAL_SECRETS],
            f"/v1/projects/{subject.PROJECT_REF}/functions": [{"slug": name, "verify_jwt": jwt} for name, jwt in subject.REQUIRED_FUNCTIONS.items()],
            f"/v1/projects/{subject.PROJECT_REF}/config/auth": {"site_url": subject.SITE, "mailer_autoconfirm": False, "password_min_length": 8, "uri_allow_list": subject.SITE, "security_captcha_enabled": True, "mailer_subjects_confirmation": "IntMed — confirmation"},
        }
        with patch.object(subject, "api_json", side_effect=lambda token, path: fixtures[path]):
            checks = subject.remote_checks("private-token")
        self.assertTrue(all(row["ok"] for row in checks))
        self.assertNotIn("must-not-leak", json.dumps(checks))
        self.assertNotIn("private-token", json.dumps(checks))

    def test_missing_sender_is_blocking(self):
        fixtures = {
            f"/v1/projects/{subject.PROJECT_REF}/secrets": [{"name": "RESEND_API_KEY"}, {"name": "NEWSLETTER_SIGNING_SECRET"}],
            f"/v1/projects/{subject.PROJECT_REF}/functions": [{"slug": name, "verify_jwt": jwt} for name, jwt in subject.REQUIRED_FUNCTIONS.items()],
            f"/v1/projects/{subject.PROJECT_REF}/config/auth": {"site_url": subject.SITE, "mailer_autoconfirm": False, "password_min_length": 8, "uri_allow_list": subject.SITE, "security_captcha_enabled": True, "mailer_subjects_confirmation": "IntMed"},
        }
        with patch.object(subject, "api_json", side_effect=lambda token, path: fixtures[path]):
            checks = subject.remote_checks("token")
        missing = next(row for row in checks if row["code"] == "SECRET_NEWSLETTER_FROM")
        self.assertFalse(missing["ok"])
        self.assertTrue(missing["blocking"])


if __name__ == "__main__":
    unittest.main()
