#!/usr/bin/env python3
"""Write the public browser configuration used by a deployed build."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse


def validate(url: str, anon_key: str) -> tuple[str, str]:
    url = url.strip().rstrip("/")
    anon_key = anon_key.strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/"):
        raise ValueError("INTMED_SUPABASE_URL must be an HTTPS project root URL")
    if not parsed.hostname or not parsed.hostname.endswith(".supabase.co"):
        raise ValueError("INTMED_SUPABASE_URL must use a *.supabase.co host")
    if len(anon_key) < 20 or any(char.isspace() for char in anon_key):
        raise ValueError("INTMED_SUPABASE_ANON_KEY is missing or malformed")
    return url, anon_key


def render(url: str, anon_key: str) -> str:
    url, anon_key = validate(url, anon_key)
    config = {
        "supabaseUrl": url,
        "supabaseAnonKey": anon_key,
        "allowLegacyDemo": False,
        "legacyAdminWhatsapp": "",
    }
    return (
        "// Generated during deployment. Do not commit credentials here.\n"
        "window.INTMED_CONFIG = "
        + json.dumps(config, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("docs/config.js"))
    args = parser.parse_args()
    try:
        output = render(
            os.environ.get("INTMED_SUPABASE_URL", ""),
            os.environ.get("INTMED_SUPABASE_ANON_KEY", ""),
        )
    except ValueError as exc:
        parser.error(str(exc))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(output, encoding="utf-8")
    temporary.replace(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
