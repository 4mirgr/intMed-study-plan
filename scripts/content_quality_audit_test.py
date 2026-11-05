#!/usr/bin/env python3
"""Unit checks for deterministic audit reports; does not inspect medical correctness."""

import hashlib
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

from content_quality_audit import Finding, audit_topic, finding_fingerprint, markdown_report, report_payload


class LocalImageAuditTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.topic = Path(self.directory.name) / 'topic'
        self.topic.mkdir()
        self.path = self.topic / 'data.json'
        self.image = {'id': 'smear', 'caption': 'لام خون محیطی', 'assetPath': 'smear.png',
                      'sourceClass': 'authored', 'copyright': 'Original IntMed image',
                      'reviewStatus': 'reviewed', 'sourceRefs': [{'sourceId': 'source'}]}
        self.source = {'id': 'source', 'title': 'Original image'}

    def write_png(self, width=900, height=800, padding=0):
        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
        raw = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress((b'\0' * (width + 1)) * height))
               + chunk(b'IEND', b'') + b'\0' * padding)
        (self.topic / 'smear.png').write_bytes(raw)
        return raw

    def findings(self):
        self.path.write_text(json.dumps({'topicId': 'topic', 'sources': [self.source],
                                         'images': [self.image]}), encoding='utf-8')
        return audit_topic(self.path)

    def codes(self):
        return {finding.code for finding in self.findings()}

    def test_local_low_resolution_is_reported_using_actual_bytes(self):
        self.write_png(64, 48)
        self.assertIn('IMAGE_LOW_RESOLUTION', self.codes())

    def test_missing_asset_is_a_finding_instead_of_aborting_audit(self):
        self.assertIn('IMAGE_ASSET_MISSING', self.codes())

    def test_asset_cannot_escape_topic_or_use_absolute_path(self):
        outside = Path(self.directory.name) / 'outside.png'
        outside.write_bytes(b'private')
        for asset in ('../outside.png', str(outside)):
            with self.subTest(asset=asset):
                self.image['assetPath'] = asset
                self.assertIn('IMAGE_ASSET_PATH_UNSAFE', self.codes())

    def test_symlink_cannot_escape_topic_directory(self):
        outside = Path(self.directory.name) / 'outside.png'
        outside.write_bytes(b'private')
        (self.topic / 'smear.png').symlink_to(outside)
        self.assertIn('IMAGE_ASSET_PATH_UNSAFE', self.codes())

    def test_declared_dimensions_and_hash_are_checked_against_asset(self):
        self.write_png()
        self.image.update(width=1200, height=800, sha256='0' * 64)
        self.assertTrue({'IMAGE_DIMENSIONS_MISMATCH', 'IMAGE_HASH_MISMATCH'} <= self.codes())

    def test_matching_asset_metadata_has_no_findings_and_stable_fingerprint(self):
        raw = self.write_png()
        self.image.update(width=900, height=800, sha256=hashlib.sha256(raw).hexdigest())
        first = self.findings()
        self.assertEqual(first, [])
        self.assertEqual(finding_fingerprint(first), finding_fingerprint(self.findings()))

    def test_large_local_asset_is_reported(self):
        self.write_png(padding=2_500_001)
        self.assertIn('IMAGE_WEB_WEIGHT', self.codes())

    def test_declared_byte_size_is_checked_against_asset(self):
        self.write_png()
        self.image['byteSize'] = 1
        self.assertIn('IMAGE_BYTE_SIZE_MISMATCH', self.codes())

    def test_missing_provenance_and_review_remain_human_findings(self):
        self.write_png()
        for field in ('sourceClass', 'copyright', 'reviewStatus'):
            self.image.pop(field)
        self.assertTrue({'IMAGE_PROVENANCE_MISSING', 'IMAGE_COPYRIGHT_MISSING',
                         'CLINICAL_REVIEW_PENDING'} <= self.codes())

    def test_open_license_requires_file_level_license_and_creator(self):
        self.write_png()
        self.image['sourceClass'] = 'open-license'
        self.assertIn('IMAGE_LICENSE_METADATA_MISSING', self.codes())

    def test_open_license_metadata_can_be_inherited_from_referenced_source(self):
        self.write_png()
        self.image.pop('sourceClass')
        self.source.update(sourceClass='open-license', creator='Example creator',
                           license='CC BY 4.0', licenseUrl='https://creativecommons.org/licenses/by/4.0/',
                           sourceUrl='https://example.org/image')
        self.assertEqual(self.findings(), [])

    def test_private_harrison_asset_is_flagged_for_public_build_review(self):
        self.write_png()
        self.image['sourceClass'] = 'harrison-private'
        self.assertIn('IMAGE_PRIVATE_ASSET', self.codes())


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
