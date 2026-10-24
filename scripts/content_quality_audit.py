#!/usr/bin/env python3
"""Conservative, dependency-free content quality audit.

This complements (never replaces) schema validation and clinical review. By default findings
are reported without failing so the legacy backlog is visible. Use --strict for a newly edited
topic once its findings have been reviewed.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import struct
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
AUDITED_FIELDS = ("lesson", "tables", "images", "flashcards", "mcq", "kfPmp")


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    topic: str
    location: str
    message: str


def finding_fingerprint(findings: Iterable[Finding]) -> str:
    """Return a stable digest for issue deduplication.

    Ordering changes must not create a new weekly issue update. The digest intentionally includes
    messages so a refined diagnostic is visible to reviewers.
    """
    rows = sorted(
        (item.severity, item.code, item.topic, item.location, item.message)
        for item in findings
    )
    raw = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def report_payload(topic_count: int, findings: list[Finding]) -> dict[str, Any]:
    counts = {
        severity: sum(item.severity == severity for item in findings)
        for severity in ("error", "warning", "info")
    }
    return {
        "topics": topic_count,
        "counts": counts,
        "fingerprint": finding_fingerprint(findings),
        "findings": [asdict(item) for item in findings],
    }


def markdown_report(payload: dict[str, Any], limit: int = 250) -> str:
    counts = payload["counts"]
    findings = payload["findings"]
    lines = [
        "# گزارش ممیزی محتوای IntMed",
        "",
        "این گزارش فقط برای بازبینی است و هیچ ادعای پزشکی را خودکار تغییر نمی‌دهد.",
        "",
        f"- مباحث بررسی‌شده: {payload['topics']}",
        f"- خطا: {counts['error']}",
        f"- هشدار: {counts['warning']}",
        f"- نیازمند بازبینی: {counts['info']}",
        "",
        f"<!-- intmed-content-audit:{payload['fingerprint']} -->",
    ]
    if not findings:
        lines.extend(["", "یافته‌ای ثبت نشد."])
        return "\n".join(lines) + "\n"
    lines.extend(["", "## یافته‌ها", ""])
    for item in findings[:limit]:
        lines.append(
            f"- **{item['severity'].upper()} · {item['code']}** — "
            f"`{item['topic']}/{item['location']}`: {item['message']}"
        )
    if len(findings) > limit:
        lines.extend(
            [
                "",
                f"{len(findings) - limit} یافتهٔ دیگر فقط در artifact کامل JSON موجود است.",
            ]
        )
    return "\n".join(lines) + "\n"


def topic_files(topic: str | None) -> list[Path]:
    files = sorted(CONTENT.glob("*/*/data.json"))
    if topic:
        files = [path for path in files if path.parent.name == topic]
        if not files:
            raise ValueError(f"unknown topic: {topic}")
    return files


def items(data: dict[str, Any]) -> Iterable[tuple[str, int, dict[str, Any]]]:
    for field in AUDITED_FIELDS:
        for index, value in enumerate(data.get(field, [])):
            if isinstance(value, dict):
                yield field, index, value


def image_dimensions(raw: bytes) -> tuple[int, int] | None:
    if raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 24:
        return struct.unpack(">II", raw[16:24])
    if raw[:6] in (b"GIF87a", b"GIF89a") and len(raw) >= 10:
        return struct.unpack("<HH", raw[6:10])
    if raw.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 9 < len(raw):
            if raw[offset] != 0xFF:
                offset += 1
                continue
            marker = raw[offset + 1]
            offset += 2
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                continue
            if offset + 2 > len(raw):
                break
            length = int.from_bytes(raw[offset : offset + 2], "big")
            if length < 2 or offset + length > len(raw):
                break
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                return (
                    int.from_bytes(raw[offset + 5 : offset + 7], "big"),
                    int.from_bytes(raw[offset + 3 : offset + 5], "big"),
                )
            offset += length
    return None


def decoded_data_uri(value: Any) -> bytes | None:
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"data:[^;,]+;base64,(.+)", value, re.DOTALL)
    if not match:
        return None
    try:
        return base64.b64decode(match.group(1), validate=True)
    except ValueError:
        return None


def normalized(value: str) -> str:
    return re.sub(r"[\s\u200c]+", " ", value).strip().casefold()


def audit_topic(path: Path) -> list[Finding]:
    data = json.loads(path.read_text(encoding="utf-8"))
    topic = str(data.get("topicId") or path.parent.name)
    findings: list[Finding] = []

    def add(severity: str, code: str, location: str, message: str) -> None:
        findings.append(Finding(severity, code, topic, location, message))

    if not data.get("sources"):
        add("warning", "SOURCE_CATALOG_EMPTY", "sources", "No source is declared for this topic.")

    serialized = json.dumps(data, ensure_ascii=False)
    if "�" in serialized:
        add("error", "BROKEN_UNICODE", "<root>", "Replacement character U+FFFD is present.")

    for field, index, item in items(data):
        stable_id = str(item.get("id") or index)
        location = f"{field}:{stable_id}"
        if not item.get("sourceRefs"):
            add("warning", "SOURCE_REF_MISSING", location, "Item has no page-level source reference.")

        text = json.dumps(item, ensure_ascii=False)
        if re.search(r"(?<![A-Za-z])جگر(?![A-Za-z])", text) and not re.search(r"پوتز|Jeghers", text, re.I):
            add("error", "TERM_LIVER", location, "Use «کبد» in Persian medical prose.")
        if re.search(r" {2,}|\t", text):
            add("warning", "WHITESPACE", location, "Repeated spaces or a tab should be reviewed.")

        if field == "flashcards":
            front = normalized(str(item.get("front", "")))
            back = normalized(str(item.get("back", "")))
            if front and back and (front == back or back in front):
                add("error", "FLASHCARD_ANSWER_LEAK", location, "The answer may be exposed on the front.")

        if field == "mcq":
            options = [normalized(str(option)) for option in item.get("options", [])]
            if len(options) != len(set(options)):
                add("error", "MCQ_DUPLICATE_OPTION", location, "Two or more answer options are identical.")
            if not str(item.get("explanation", "")).strip():
                add("warning", "MCQ_EXPLANATION_MISSING", location, "The correct answer has no explanation.")
            option_explanations = item.get("optionExplanations")
            if not isinstance(option_explanations, list) or len(option_explanations) != len(options):
                add("warning", "MCQ_DISTRACTOR_REVIEW_MISSING", location, "Explain every option/distractor.")
            if item.get("reviewStatus") != "reviewed":
                add("info", "CLINICAL_REVIEW_PENDING", location, "Teacher clinical review is still pending.")

        if field == "kfPmp":
            steps = item.get("steps", [])
            if len(steps) < 2:
                add("warning", "KFP_TOO_SHORT", location, "A stepwise case normally needs at least two decisions.")
            for step_index, step in enumerate(steps):
                if isinstance(step, dict) and not step.get("sourceRefs"):
                    add("warning", "SOURCE_REF_MISSING", f"{location}/step:{step.get('id', step_index)}", "Step has no source reference.")

        if field == "images":
            if not str(item.get("caption", "")).strip():
                add("error", "IMAGE_CAPTION_MISSING", location, "Image has no caption.")
            raw = decoded_data_uri(item.get("sourceUrl"))
            dimensions = image_dimensions(raw) if raw else None
            if dimensions and max(dimensions) < 800:
                add("warning", "IMAGE_LOW_RESOLUTION", location, f"Embedded image is only {dimensions[0]}×{dimensions[1]} px.")
            if raw and len(raw) > 2_500_000:
                add("warning", "IMAGE_WEB_WEIGHT", location, f"Embedded source is {len(raw) / 1_000_000:.1f} MB; publish an optimized derivative.")

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", help="audit one stable topic ID")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--markdown", action="store_true", help="emit a reviewer-friendly Markdown summary")
    parser.add_argument("--output", type=Path, help="write the selected report format to this file")
    parser.add_argument("--strict", action="store_true", help="fail when any finding remains")
    args = parser.parse_args()
    try:
        paths = topic_files(args.topic)
        findings = [finding for path in paths for finding in audit_topic(path)]
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if args.json and args.markdown:
        parser.error("--json and --markdown are mutually exclusive")
    payload = report_payload(len(paths), findings)
    counts = payload["counts"]
    if args.json:
        rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    elif args.markdown:
        rendered = markdown_report(payload)
    else:
        lines = [f"audited {len(paths)} topic(s): {counts['error']} error, {counts['warning']} warning, {counts['info']} info"]
        for item in findings:
            lines.append(f"{item.severity.upper()} {item.code} {item.topic}/{item.location}: {item.message}")
        rendered = "\n".join(lines) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 1 if args.strict and findings else 0


if __name__ == "__main__":
    sys.exit(main())
