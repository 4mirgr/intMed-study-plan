#!/usr/bin/env python3
"""Migrate an exported legacy state.json after Supabase users exist.

The mapping file is JSON: {"legacy-user-id": "supabase-user-uuid"}. Credentials are read
only from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
"""

from __future__ import annotations

import argparse
import json
import os
import uuid
from pathlib import Path
from urllib.parse import quote, urlparse
import urllib.request


def send(url: str, key: str, path: str, method: str, payload, prefer: str = "return=minimal") -> None:
    request = urllib.request.Request(
        url + path,
        data=json.dumps(payload).encode(),
        method=method,
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status not in (200, 201, 204):
            raise SystemExit(f"migration failed: HTTP {response.status} for {path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("state_json")
    parser.add_argument("user_mapping_json")
    parser.add_argument("--dry-run", action="store_true", help="validate and report counts without sending data")
    parser.add_argument("--allow-unmapped", action="store_true", help="skip legacy users missing from the mapping")
    args = parser.parse_args()
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not url or not key):
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    if url:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co"):
            raise SystemExit("SUPABASE_URL must be an HTTPS *.supabase.co project URL")
    state = json.loads(Path(args.state_json).read_text(encoding="utf-8"))
    mapping = json.loads(Path(args.user_mapping_json).read_text(encoding="utf-8"))
    if not isinstance(state.get("users"), dict) or not isinstance(mapping, dict):
        raise SystemExit("invalid legacy state or mapping structure")
    invalid_mappings = 0
    for mapped_id in mapping.values():
        try:
            uuid.UUID(str(mapped_id))
        except (ValueError, TypeError, AttributeError):
            invalid_mappings += 1
    if invalid_mappings:
        raise SystemExit(f"mapping contains {invalid_mappings} invalid Supabase UUID(s)")
    unmapped = [legacy_id for legacy_id in state["users"] if legacy_id not in mapping]
    if unmapped and not args.allow_unmapped:
        raise SystemExit(f"mapping is missing {len(unmapped)} legacy user(s); use --allow-unmapped only intentionally")
    rows = []
    profile_rows = []
    for legacy_id, bucket in (state.get("users") or {}).items():
        user_id = mapping.get(legacy_id)
        if not user_id:
            continue
        clean = dict(bucket)
        clean.pop("passwordHash", None)
        profile = clean.pop("profile", {}) or {}
        rows.append({"user_id": user_id, "state": clean})
        profile_rows.append((user_id, {
            "full_name": profile.get("fullName") or None,
            "degree": profile.get("degree") or None,
            "id_number": profile.get("idNumber") or None,
            "phone": profile.get("phone") or None,
            "email": profile.get("email") or None,
        }))
    tickets = []
    skipped_tickets = 0
    for ticket in state.get("tickets") or []:
        user_id = mapping.get(ticket.get("userId"))
        if not user_id:
            skipped_tickets += 1
            continue
        payload = dict(ticket)
        ticket_id = payload.pop("id")
        payload.pop("userId", None)
        tickets.append({"id": ticket_id, "user_id": user_id, "payload": payload})
    if args.dry_run:
        print(
            f"dry run passed: {len(rows)} user state row(s), {len(tickets)} ticket(s), "
            f"{len(unmapped)} unmapped user(s), {skipped_tickets} skipped ticket(s); passwords excluded"
        )
        return 0
    if rows:
        send(url, key, "/rest/v1/study_state?on_conflict=user_id", "POST", rows, "resolution=merge-duplicates,return=minimal")
    for user_id, profile in profile_rows:
        send(url, key, "/rest/v1/profiles?id=eq." + quote(user_id, safe=""), "PATCH", profile)
    if tickets:
        send(url, key, "/rest/v1/tickets?on_conflict=id", "POST", tickets, "resolution=merge-duplicates,return=minimal")
    print(f"migrated {len(rows)} user state row(s) and {len(tickets)} ticket(s); passwords were intentionally not migrated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
