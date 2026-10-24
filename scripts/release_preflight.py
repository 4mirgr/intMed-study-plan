#!/usr/bin/env python3
"""Fail-safe release checks without printing or storing secret values."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PROJECT_REF = "upwbktvnybsjugdegjji"
SITE = "https://drgerami-md.ir"
REQUIRED_SECRETS = {
    "RESEND_API_KEY",
    "NEWSLETTER_FROM",
    "NEWSLETTER_SIGNING_SECRET",
    "TELEGRAM_WEBHOOK_SECRET",
}
REQUIRED_FUNCTIONS = {
    "intmed-login": False,
    "intmed-newsletter": False,
    "intmed-signup-notify": True,
    "intmed-study-event": True,
    "intmed-telegram-bot": False,
    "intmed-purchase-verify": True,
}


def finding(code: str, ok: bool, detail: str, *, blocking: bool = True) -> dict:
    return {"code": code, "ok": ok, "blocking": blocking, "detail": detail}


def local_checks(root: Path) -> list[dict]:
    index = (root / "docs/index.html").read_text(encoding="utf-8")
    newsletter = (root / "backend/supabase/functions/intmed-newsletter/index.ts").read_text(encoding="utf-8")
    calendar = (root / "backend/supabase/functions/intmed-study-event/index.ts").read_text(encoding="utf-8")
    config = (root / "backend/supabase/config.toml").read_text(encoding="utf-8")
    checks = [
        finding("CSP_API", "https://api.drgerami-md.ir" in index, "CSP permits only the production API origin."),
        finding("CSP_SUPABASE", "https://upwbktvnybsjugdegjji.supabase.co" in index, "CSP permits the known Supabase fallback."),
        finding("NEWSLETTER_ORIGINS", SITE in newsletter and "https://www.drgerami-md.ir" in newsletter, "Newsletter origin allow-list contains canonical and www domains."),
        finding("CALENDAR_ORIGINS", SITE in calendar and "https://www.drgerami-md.ir" in calendar, "Calendar origin allow-list contains canonical and www domains."),
        finding("NEWSLETTER_PUBLIC_GATEWAY", "[functions.intmed-newsletter]" in config and "verify_jwt = false" in config.split("[functions.intmed-newsletter]", 1)[1].split("[", 1)[0], "Signed unsubscribe function has gateway JWT disabled; handler performs its own checks."),
        finding("NO_SERVICE_ROLE_BROWSER", "service_role" not in index.lower(), "Browser HTML contains no service-role credential marker."),
        finding("PWA_MANIFEST", 'rel="manifest" href="manifest.webmanifest"' in index, "Persian install manifest is linked."),
    ]
    for rel in [
        "backend/supabase/NEWSLETTER_SETUP_FA.md",
        "docs/RELEASE_READINESS_FA.md",
        "docs/PWA_ANDROID_DOMAIN_RUNBOOK_FA.md",
    ]:
        checks.append(finding("DOC_" + Path(rel).stem.upper(), (root / rel).is_file(), f"Required runbook exists: {rel}."))
    return checks


def api_json(token: str, path: str):
    request = Request(
        "https://api.supabase.com" + path,
        headers={"Authorization": "Bearer " + token, "Accept": "application/json", "User-Agent": "intmed-release-preflight"},
    )
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def remote_checks(token: str, project_ref: str = PROJECT_REF) -> list[dict]:
    checks: list[dict] = []
    try:
        secrets = api_json(token, f"/v1/projects/{project_ref}/secrets")
        names = {row.get("name") for row in secrets if isinstance(row, dict)}
        for name in sorted(REQUIRED_SECRETS):
            checks.append(finding("SECRET_" + name, name in names, f"Supabase secret name is configured: {name}."))
        functions = api_json(token, f"/v1/projects/{project_ref}/functions")
        by_slug = {row.get("slug") or row.get("name"): row for row in functions if isinstance(row, dict)}
        for slug, expected_jwt in REQUIRED_FUNCTIONS.items():
            row = by_slug.get(slug)
            checks.append(finding("FUNCTION_" + slug.upper().replace("-", "_"), bool(row), f"Edge Function is deployed: {slug}."))
            if row:
                actual = row.get("verify_jwt")
                checks.append(finding("JWT_" + slug.upper().replace("-", "_"), actual is expected_jwt, f"{slug} verify_jwt is {str(expected_jwt).lower()}."))
        auth = api_json(token, f"/v1/projects/{project_ref}/config/auth")
        redirects = str(auth.get("uri_allow_list") or "")
        checks.extend([
            finding("AUTH_SITE_URL", auth.get("site_url") == SITE, "Supabase Auth Site URL is the canonical HTTPS origin."),
            finding("AUTH_EMAIL_CONFIRM", auth.get("mailer_autoconfirm") is False, "Auth email confirmation remains enabled."),
            finding("AUTH_PASSWORD_LENGTH", int(auth.get("password_min_length") or 0) >= 8, "New passwords require at least 8 characters."),
            finding("AUTH_REDIRECT_ORIGIN", SITE in redirects, "Redirect allow-list contains the canonical origin."),
            finding("AUTH_REDIRECT_SCOPE", "*" not in redirects, "Redirect allow-list uses exact callbacks instead of wildcards.", blocking=False),
            finding("AUTH_CAPTCHA", auth.get("security_captcha_enabled") is True, "CAPTCHA is enabled before public growth.", blocking=False),
            finding("AUTH_BRANDED_CONFIRMATION", "intmed" in str(auth.get("mailer_subjects_confirmation") or "").lower(), "Confirmation email subject contains the current brand.", blocking=False),
        ])
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        checks.append(finding("SUPABASE_MANAGEMENT", False, f"Management API check failed ({type(exc).__name__}); no secret value was read or printed."))
    return checks


def render(checks: list[dict], json_output: bool) -> None:
    if json_output:
        print(json.dumps({"ok": all(c["ok"] or not c["blocking"] for c in checks), "checks": checks}, ensure_ascii=False, indent=2))
        return
    for item in checks:
        print(("PASS" if item["ok"] else "FAIL") + " " + item["code"] + " — " + item["detail"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IntMed release readiness preflight")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--remote", action="store_true", help="Read names/config only from Supabase Management API")
    parser.add_argument("--project-ref", default=PROJECT_REF)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    checks = local_checks(args.root)
    if args.remote:
        token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
        if not token:
            checks.append(finding("SUPABASE_ACCESS_TOKEN", False, "Set SUPABASE_ACCESS_TOKEN only in the shell/CI secret store for remote preflight."))
        else:
            checks.extend(remote_checks(token, args.project_ref))
    render(checks, args.json)
    return 0 if all(c["ok"] or not c["blocking"] for c in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
