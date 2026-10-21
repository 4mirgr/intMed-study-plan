#!/usr/bin/env python3
"""Unit checks for deployment configuration generation."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from write_runtime_config import render, validate


class RuntimeConfigTest(unittest.TestCase):
    def test_render_is_valid_javascript_assignment(self) -> None:
        output = render("https://sample.supabase.co/", "a" * 32)
        payload = re.fullmatch(r".*window\.INTMED_CONFIG = (\{.*\});\n", output, re.S)
        self.assertIsNotNone(payload)
        config = json.loads(payload.group(1))
        self.assertEqual(config["supabaseUrl"], "https://sample.supabase.co")
        self.assertFalse(config["allowLegacyDemo"])

    def test_render_accepts_intmed_same_domain_gateway(self) -> None:
        output = render("https://api.drgerami-md.ir", "a" * 32)
        payload = re.fullmatch(r".*window\.INTMED_CONFIG = (\{.*\});\n", output, re.S)
        self.assertEqual(
            json.loads(payload.group(1))["supabaseUrl"],
            "https://api.drgerami-md.ir",
        )

    def test_rejects_blank_values(self) -> None:
        with self.assertRaises(ValueError):
            validate("", "")

    def test_rejects_non_supabase_or_non_https_url(self) -> None:
        for url in ("http://sample.supabase.co", "https://example.com"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate(url, "a" * 32)

    def test_cli_reuses_public_existing_key_with_gateway_override(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "config.js"
            output.write_text(render("https://sample.supabase.co", "a" * 32))
            environment = dict(os.environ)
            environment["INTMED_SUPABASE_URL"] = "https://api.drgerami-md.ir"
            environment.pop("INTMED_SUPABASE_ANON_KEY", None)
            subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("write_runtime_config.py")),
                    "--allow-existing",
                    "--output",
                    str(output),
                ],
                check=True,
                env=environment,
            )
            config = json.loads(
                re.search(
                    r"window\.INTMED_CONFIG = (\{.*\});", output.read_text()
                ).group(1)
            )
            self.assertEqual(config["supabaseUrl"], "https://api.drgerami-md.ir")
            self.assertEqual(config["supabaseAnonKey"], "a" * 32)


if __name__ == "__main__":
    unittest.main()
