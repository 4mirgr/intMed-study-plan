#!/usr/bin/env python3
"""Write the public browser configuration used by a deployed build."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

DEFAULT_PUBLIC_API_URL = "https://api.drgerami-md.ir"


def validate(url: str, anon_key: str) -> tuple[str, str]:
    url = url.strip().rstrip("/")
    anon_key = anon_key.strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/"):
        raise ValueError("INTMED_SUPABASE_URL must be an HTTPS project root URL")
    if not parsed.hostname or not (
        parsed.hostname.endswith(".supabase.co")
        or parsed.hostname == "api.drgerami-md.ir"
    ):
        raise ValueError("API URL must use the IntMed gateway or a *.supabase.co host")
    if len(anon_key) < 20 or any(char.isspace() for char in anon_key):
        raise ValueError("INTMED_SUPABASE_ANON_KEY is missing or malformed")
    return url, anon_key


def render(url: str, anon_key: str, browser_url: str | None = None) -> str:
    url, anon_key = validate(url, anon_key)
    if browser_url:
        browser_url, _ = validate(browser_url, anon_key)
    else:
        browser_url = url
    config = {
        "supabaseSameOriginPath": "/api",
        "supabaseUrl": browser_url,
        "supabaseFallbackUrl": url if browser_url != url else "",
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
    parser.add_argument(
        "--allow-existing",
        action="store_true",
        help="validate an existing generated config when deployment variables are unavailable",
    )
    args = parser.parse_args()
    url = os.environ.get("INTMED_SUPABASE_URL", "")
    anon_key = os.environ.get("INTMED_SUPABASE_ANON_KEY", "")
    browser_url = os.environ.get("INTMED_PUBLIC_API_URL", DEFAULT_PUBLIC_API_URL)
    if args.allow_existing and not url and not anon_key:
        existing = args.output.read_text(encoding="utf-8")
        match = re.search(r"window\.INTMED_CONFIG\s*=\s*(\{.*\});", existing, re.S)
        if not match:
            parser.error("existing runtime config is not a generated JSON assignment")
        config = json.loads(match.group(1))
        validate(config.get("supabaseUrl", ""), config.get("supabaseAnonKey", ""))
        print("existing production configuration is valid")
        return 0
    try:
        output = render(url, anon_key, browser_url)
    except ValueError as exc:
        parser.error(str(exc))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(output, encoding="utf-8")
    temporary.replace(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
