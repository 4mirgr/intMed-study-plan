#!/usr/bin/env python3
"""Unit checks for deterministic audit reports; does not inspect medical correctness."""

import unittest

from content_quality_audit import Finding, finding_fingerprint, markdown_report, report_payload


class ContentQualityAuditReportTest(unittest.TestCase):
    def setUp(self):
        self.first = Finding("warning", "SOURCE_REF_MISSING", "topic-b", "lesson:b", "Missing")
        self.second = Finding("error", "BROKEN_UNICODE", "topic-a", "<root>", "Broken")

    def test_fingerprint_is_order_independent(self):
        self.assertEqual(
            finding_fingerprint([self.first, self.second]),
            finding_fingerprint([self.second, self.first]),
        )

    def test_markdown_contains_dedup_marker_and_safety_copy(self):
        payload = report_payload(2, [self.first, self.second])
        markdown = markdown_report(payload)
        self.assertIn(f"<!-- intmed-content-audit:{payload['fingerprint']} -->", markdown)
        self.assertIn("هیچ ادعای پزشکی را خودکار تغییر نمی‌دهد", markdown)
        self.assertIn("topic-a/<root>", markdown)

    def test_report_counts(self):
        payload = report_payload(2, [self.first, self.second])
        self.assertEqual(payload["counts"], {"error": 1, "warning": 1, "info": 0})


if __name__ == "__main__":
    unittest.main()
