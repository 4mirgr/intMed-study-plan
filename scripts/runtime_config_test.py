#!/usr/bin/env python3
"""Unit checks for deployment configuration generation."""

from __future__ import annotations

import json
import re
import unittest

from write_runtime_config import DEFAULT_PUBLIC_API_URL, render, validate


class RuntimeConfigTest(unittest.TestCase):
    def test_render_is_valid_javascript_assignment(self) -> None:
        output = render("https://sample.supabase.co/", "a" * 32)
        payload = re.fullmatch(r".*window\.INTMED_CONFIG = (\{.*\});\n", output, re.S)
        self.assertIsNotNone(payload)
        config = json.loads(payload.group(1))
        self.assertEqual(config["supabaseUrl"], "https://sample.supabase.co")
        self.assertEqual(config["supabaseFallbackUrl"], "")
        self.assertFalse(config["allowLegacyDemo"])

    def test_render_uses_public_gateway_for_production(self) -> None:
        output = render("https://sample.supabase.co", "a" * 32, DEFAULT_PUBLIC_API_URL)
        payload = re.search(r"window\.INTMED_CONFIG = (\{.*\});", output)
        config = json.loads(payload.group(1))
        self.assertEqual(config["supabaseUrl"], DEFAULT_PUBLIC_API_URL)
        self.assertEqual(config["supabaseFallbackUrl"], "https://sample.supabase.co")

    def test_rejects_blank_values(self) -> None:
        with self.assertRaises(ValueError):
            validate("", "")

    def test_rejects_non_supabase_or_non_https_url(self) -> None:
        for url in ("http://sample.supabase.co", "https://example.com"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate(url, "a" * 32)

    def test_accepts_public_gateway(self) -> None:
        self.assertEqual(validate(DEFAULT_PUBLIC_API_URL, "a" * 32)[0], DEFAULT_PUBLIC_API_URL)


if __name__ == "__main__":
    unittest.main()
