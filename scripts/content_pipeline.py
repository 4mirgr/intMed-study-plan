#!/usr/bin/env python3
"""Deterministic content tooling for IntMed.

Commands:
  migrate      normalize legacy fields and add durable IDs
  validate     schema + cross-file/business validation
  build        generate per-topic web payloads and external image files
  check        prove generated output is current
  init-topic   create a topic package and taxonomy entry
  extract-pdf  cache reusable PDF text and embedded images
"""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import mimetypes
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
SCHEMA_PATH = CONTENT / "_schema" / "topic-content.schema.json"
TAXONOMY_PATH = CONTENT / "taxonomy.json"
WEB_CONTENT = ROOT / "docs" / "content"
SOURCE_CACHE = ROOT / ".cache" / "source-extract"

FIELDS = ("flashcards", "mcq", "kfPmp", "images", "tables", "lesson", "ventSim")
ID_PREFIXES = {
    "flashcards": "fc",
    "mcq": "mcq",
    "kfPmp": "kf",
    "images": "img",
    "tables": "tbl",
    "lesson": "lsn",
    "ventSim": "vent",
}
SHARED_TOPIC_ALIASES = {"poison-rhabdo-myopathy": "rhabdo-myopathy"}
BLOB_OVERRIDES = {"cardio-hf:0": "assets/heart-failure-mortality-figure.jpg"}


class PipelineError(RuntimeError):
    pass


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any, *, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(
            value,
            handle,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
        )
        handle.write("\n")


def topic_paths() -> list[Path]:
    return sorted(CONTENT.glob("*/*/data.json"))


def load_topics() -> dict[str, tuple[Path, dict[str, Any]]]:
    topics: dict[str, tuple[Path, dict[str, Any]]] = {}
    for path in topic_paths():
        data = read_json(path)
        topic_id = data.get("topicId")
        if not isinstance(topic_id, str) or not topic_id:
            raise PipelineError(f"{path.relative_to(ROOT)}: missing topicId")
        if topic_id in topics:
            raise PipelineError(f"duplicate topicId: {topic_id}")
        topics[topic_id] = (path, data)
    return topics


def taxonomy_topic_map(taxonomy: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for category in taxonomy.get("categories", []):
        category_id = category.get("id")
        for topic in category.get("topics", []):
            topic_id = topic.get("id")
            if topic_id in result:
                raise PipelineError(f"taxonomy has duplicate topic id: {topic_id}")
            result[topic_id] = category_id
    return result


def next_id(prefix: str, index: int, used: set[str]) -> str:
    candidate_index = index + 1
    while True:
        candidate = f"{prefix}-{candidate_index:03d}"
        if candidate not in used:
            used.add(candidate)
            return candidate
        candidate_index += 1


def migrate_topic(data: dict[str, Any]) -> bool:
    changed = False
    for field in FIELDS:
        items = data.get(field, [])
        if not isinstance(items, list):
            continue
        used = {item.get("id") for item in items if isinstance(item, dict) and item.get("id")}
        prefix = ID_PREFIXES[field]
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            if not item.get("id"):
                if field in ("flashcards", "mcq", "kfPmp"):
                    item["legacyKey"] = str(index)
                item["id"] = next_id(prefix, index, used)
                changed = True
            if field == "mcq" and "explain" in item:
                if not item.get("explanation"):
                    item["explanation"] = item["explain"]
                del item["explain"]
                changed = True
            if field == "kfPmp":
                step_used = {step.get("id") for step in item.get("steps", []) if isinstance(step, dict) and step.get("id")}
                for step_index, step in enumerate(item.get("steps", [])):
                    if isinstance(step, dict) and "legacyIndex" not in step:
                        step["legacyIndex"] = step_index
                        changed = True
                    if isinstance(step, dict) and not step.get("id"):
                        step["id"] = next_id(f"{item['id']}-step", step_index, step_used)
                        changed = True
            if field == "lesson" and "body" in item and "paragraphs" not in item:
                paragraphs = [part.strip() for part in re.split(r"\n\s*\n", str(item.get("body", ""))) if part.strip()]
                item["paragraphs"] = [
                    {
                        "id": f"{item['id']}-p{para_index + 1:02d}",
                        "text": text,
                        "legacyLoc": f"lesson:{index}:{para_index}",
                    }
                    for para_index, text in enumerate(paragraphs)
                ]
                del item["body"]
                changed = True
            if field == "lesson":
                for para_index, paragraph in enumerate(item.get("paragraphs", [])):
                    if isinstance(paragraph, dict) and "legacyLoc" not in paragraph:
                        paragraph["legacyLoc"] = f"lesson:{index}:{para_index}"
                        changed = True
            if field == "tables" and "rowIds" not in item:
                lines = [line for line in str(item.get("markdown", "")).splitlines() if line.strip()]
                row_count = max(0, len(lines) - (1 if len(lines) >= 2 else 0))
                item["rowIds"] = [f"{item['id']}-r{row_index:02d}" for row_index in range(row_count)]
                changed = True
            if field == "tables" and "legacyIndex" not in item:
                item["legacyIndex"] = index
                changed = True
            if field == "tables" and "legacyRowIndices" not in item:
                item["legacyRowIndices"] = list(range(len(item.get("rowIds", []))))
                changed = True
    return changed


def cmd_migrate(_: argparse.Namespace) -> int:
    changed_paths: list[Path] = []
    for path in topic_paths():
        data = read_json(path)
        if migrate_topic(data):
            write_json(path, data)
            changed_paths.append(path)
    print(f"migrated {len(changed_paths)} of {len(topic_paths())} topic files")
    for path in changed_paths:
        print(f"  {path.relative_to(ROOT)}")
    return 0


def iter_source_refs(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        refs = value.get("sourceRefs")
        if isinstance(refs, list):
            yield from (ref for ref in refs if isinstance(ref, dict))
        for child in value.values():
            yield from iter_source_refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_source_refs(child)


def validate_data_uri(uri: str) -> None:
    match = re.fullmatch(r"data:([^;,]+);base64,(.+)", uri, flags=re.DOTALL)
    if not match:
        raise ValueError("unsupported data URI (expected base64)")
    base64.b64decode(match.group(2), validate=True)


def cmd_validate(_: argparse.Namespace) -> int:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        taxonomy = read_json(TAXONOMY_PATH)
        tax_map = taxonomy_topic_map(taxonomy)
        topics = load_topics()
    except (OSError, json.JSONDecodeError, PipelineError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    try:
        import jsonschema
    except ImportError:
        errors.append("jsonschema is required; install requirements-dev.txt")
    else:
        schema = read_json(SCHEMA_PATH)
        validator = jsonschema.Draft7Validator(schema)
        for topic_id, (path, data) in topics.items():
            for error in sorted(validator.iter_errors(data), key=lambda item: list(item.absolute_path)):
                location = ".".join(map(str, error.absolute_path)) or "<root>"
                errors.append(f"{path.relative_to(ROOT)}:{location}: {error.message}")

    all_images: set[tuple[str, str]] = set()
    for topic_id, (path, data) in topics.items():
        rel = path.relative_to(ROOT)
        if path.parent.name != topic_id:
            errors.append(f"{rel}: folder name must equal topicId {topic_id!r}")
        expected_category = tax_map.get(topic_id)
        if expected_category and data.get("category") != expected_category:
            errors.append(f"{rel}: category {data.get('category')!r} != taxonomy {expected_category!r}")
        if not expected_category and topic_id not in SHARED_TOPIC_ALIASES.values():
            warnings.append(f"{rel}: topic is not listed in taxonomy")

        serialized = json.dumps(data, ensure_ascii=False)
        if "�" in serialized:
            errors.append(f"{rel}: contains U+FFFD replacement character")
        for match in re.finditer("جگر", serialized):
            context = serialized[max(0, match.start() - 30):match.end() + 30]
            if "پوتز" not in context and "Jeghers" not in context:
                errors.append(f"{rel}: uses جگر for liver (context: {context!r})")
        if re.search(r'"explain"\s*:', serialized):
            errors.append(f"{rel}: legacy mcq.explain remains; run migrate")

        for field in FIELDS:
            items = data.get(field, [])
            if not isinstance(items, list):
                continue
            ids: set[str] = set()
            for index, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                item_id = item.get("id")
                if not item_id:
                    errors.append(f"{rel}:{field}[{index}] has no stable id; run migrate")
                elif item_id in ids:
                    errors.append(f"{rel}:{field} has duplicate id {item_id!r}")
                else:
                    ids.add(item_id)
                if field == "mcq":
                    answer = item.get("correctIndex")
                    options = item.get("options", [])
                    if not isinstance(answer, int) or not 0 <= answer < len(options):
                        errors.append(f"{rel}:mcq[{index}] correctIndex is out of bounds")
                if field == "lesson" and isinstance(item.get("paragraphs"), list):
                    para_ids: set[str] = set()
                    for para_index, para in enumerate(item["paragraphs"]):
                        para_id = para.get("id") if isinstance(para, dict) else None
                        if not para_id:
                            errors.append(f"{rel}:lesson[{index}].paragraphs[{para_index}] has no id")
                        elif para_id in para_ids:
                            errors.append(f"{rel}:lesson[{index}] duplicate paragraph id {para_id!r}")
                        else:
                            para_ids.add(para_id)
                if field == "images" and item_id:
                    all_images.add((topic_id, item_id))
                    source = item.get("sourceUrl", "")
                    if isinstance(source, str) and source.startswith("data:"):
                        try:
                            validate_data_uri(source)
                        except ValueError as exc:
                            errors.append(f"{rel}:images[{index}] {exc}")

        source_ids = {source.get("id") for source in data.get("sources", []) if isinstance(source, dict) and source.get("id")}
        for ref in iter_source_refs(data):
            if not ref.get("sourceId"):
                errors.append(f"{rel}: sourceRefs entry lacks sourceId")
            elif ref.get("sourceId") not in source_ids:
                errors.append(f"{rel}: sourceRefs points to undeclared sourceId {ref.get('sourceId')!r}")

    for topic_id, (path, data) in topics.items():
        for field in ("mcq", "kfPmp"):
            for index, item in enumerate(data.get(field, [])):
                ref = item.get("imageRef") if isinstance(item, dict) else None
                if ref and (ref.get("topicId"), ref.get("imageId")) not in all_images:
                    errors.append(f"{path.relative_to(ROOT)}:{field}[{index}] has unresolved imageRef {ref}")
                if field == "kfPmp" and isinstance(item, dict):
                    for step_index, step in enumerate(item.get("steps", [])):
                        step_ref = step.get("imageRef") if isinstance(step, dict) else None
                        if step_ref and (step_ref.get("topicId"), step_ref.get("imageId")) not in all_images:
                            errors.append(f"{path.relative_to(ROOT)}:{field}[{index}].steps[{step_index}] unresolved imageRef {step_ref}")

    for alias, canonical in SHARED_TOPIC_ALIASES.items():
        if canonical not in topics:
            errors.append(f"alias {alias} points to missing canonical topic {canonical}")
        if alias not in tax_map:
            errors.append(f"alias {alias} is not listed in taxonomy")

    print(f"validated {len(topics)} source topics and {len(tax_map)} taxonomy entries")
    for warning in warnings:
        print(f"WARNING: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"validation failed with {len(errors)} error(s)", file=sys.stderr)
        return 1
    print(f"validation passed ({len(warnings)} warning(s))")
    return 0


def image_extension(mime: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(
        mime, mimetypes.guess_extension(mime) or ".bin"
    )


def externalize_images(topic_id: str, payload: dict[str, Any], output: Path) -> None:
    for index, image in enumerate(payload.get("images", [])):
        source = image.get("sourceUrl", "")
        override = BLOB_OVERRIDES.get(f"{topic_id}:{index}")
        if override:
            image["sourceUrl"] = override
            continue
        if not isinstance(source, str) or not source.startswith("data:"):
            continue
        match = re.fullmatch(r"data:([^;,]+);base64,(.+)", source, flags=re.DOTALL)
        if not match:
            raise PipelineError(f"{topic_id}: unsupported image data URI at index {index}")
        raw = base64.b64decode(match.group(2), validate=True)
        digest = hashlib.sha256(raw).hexdigest()
        safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(image.get("id") or f"img-{index + 1:03d}"))
        filename = f"{safe_id}-{digest[:12]}{image_extension(match.group(1))}"
        target = output / "images" / topic_id / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        image["sourceUrl"] = f"content/images/{topic_id}/{filename}"
        image["sha256"] = digest


def publish_payload(data: dict[str, Any]) -> dict[str, Any]:
    payload = {field: copy.deepcopy(data.get(field, [])) for field in FIELDS}
    payload["sources"] = copy.deepcopy(data.get("sources", []))
    for section_index, section in enumerate(payload.get("lesson", [])):
        for paragraph_index, paragraph in enumerate(section.get("paragraphs", [])):
            paragraph.setdefault("legacyLoc", f"lesson:{section_index}:{paragraph_index}")
    return payload


def build_to(output: Path) -> dict[str, Any]:
    topics = load_topics()
    taxonomy = read_json(TAXONOMY_PATH)
    tax_map = taxonomy_topic_map(taxonomy)
    output.mkdir(parents=True, exist_ok=True)
    (output / "topics").mkdir(parents=True, exist_ok=True)
    write_json(output / "taxonomy.json", taxonomy, pretty=False)

    payloads: dict[str, dict[str, Any]] = {}
    for topic_id, (_, data) in topics.items():
        payloads[topic_id] = publish_payload(data)
    for alias, canonical in SHARED_TOPIC_ALIASES.items():
        payloads[alias] = copy.deepcopy(payloads[canonical])

    manifest_topics: dict[str, Any] = {}
    for topic_id in sorted(tax_map):
        payload = payloads.get(topic_id, {field: [] for field in FIELDS})
        externalize_images(topic_id, payload, output)
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        topic_file = output / "topics" / f"{topic_id}.json"
        topic_file.write_bytes(serialized)
        manifest_topics[topic_id] = {
            "path": f"content/topics/{topic_id}.json",
            "sha256": hashlib.sha256(serialized).hexdigest(),
            "bytes": len(serialized),
            "counts": {field: len(payload.get(field, [])) for field in FIELDS},
        }

    taxonomy_bytes = (output / "taxonomy.json").read_bytes()
    build_hash = hashlib.sha256(
        taxonomy_bytes + "".join(item["sha256"] for item in manifest_topics.values()).encode("ascii")
    ).hexdigest()
    manifest = {"version": 1, "buildId": build_hash[:16], "topics": manifest_topics}
    write_json(output / "manifest.json", manifest, pretty=False)
    return manifest


def cmd_build(_: argparse.Namespace) -> int:
    if cmd_validate(argparse.Namespace()) != 0:
        return 1
    temp_root = Path(tempfile.mkdtemp(prefix="intmed-build-", dir=ROOT / "docs"))
    try:
        generated = temp_root / "content"
        manifest = build_to(generated)
        if WEB_CONTENT.exists():
            shutil.rmtree(WEB_CONTENT)
        generated.replace(WEB_CONTENT)
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
    print(f"built {len(manifest['topics'])} per-topic payloads ({manifest['buildId']})")
    return 0


def tree_hashes(root: Path) -> dict[str, str]:
    if not root.exists():
        return {}
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def cmd_check(_: argparse.Namespace) -> int:
    if cmd_validate(argparse.Namespace()) != 0:
        return 1
    with tempfile.TemporaryDirectory(prefix="intmed-check-") as temp:
        expected_root = Path(temp) / "content"
        build_to(expected_root)
        expected = tree_hashes(expected_root)
        actual = tree_hashes(WEB_CONTENT)
    if expected != actual:
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        changed = sorted(path for path in set(expected) & set(actual) if expected[path] != actual[path])
        for label, paths in (("missing", missing), ("extra", extra), ("changed", changed)):
            for path in paths[:30]:
                print(f"{label}: docs/content/{path}", file=sys.stderr)
        print("generated site content is stale; run: python3 scripts/content_pipeline.py build", file=sys.stderr)
        return 1
    print(f"generated site content is current ({len(actual)} files)")
    return 0


def cmd_init_topic(args: argparse.Namespace) -> int:
    taxonomy = read_json(TAXONOMY_PATH)
    category = next((item for item in taxonomy.get("categories", []) if item.get("id") == args.category), None)
    if category is None:
        raise PipelineError(f"unknown category: {args.category}")
    if args.topic_id in taxonomy_topic_map(taxonomy):
        raise PipelineError(f"topic already exists in taxonomy: {args.topic_id}")
    target = CONTENT / args.category / args.topic_id / "data.json"
    if target.exists():
        raise PipelineError(f"topic file already exists: {target.relative_to(ROOT)}")
    category.setdefault("topics", []).append({"id": args.topic_id, "label": args.label})
    write_json(TAXONOMY_PATH, taxonomy)
    write_json(
        target,
        {
            "topicId": args.topic_id,
            "category": args.category,
            "sourceNote": "",
            "sources": [],
            "flashcards": [],
            "mcq": [],
            "kfPmp": [],
            "images": [],
            "tables": [],
            "lesson": [],
            "ventSim": [],
        },
    )
    print(f"created {target.relative_to(ROOT)} and added taxonomy entry")
    return 0


def cmd_extract_pdf(args: argparse.Namespace) -> int:
    try:
        import pymupdf
    except ImportError as exc:
        raise PipelineError("PyMuPDF is required; install requirements-dev.txt") from exc
    source = Path(args.pdf).resolve()
    if not source.is_file():
        raise PipelineError(f"PDF not found: {source}")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    target = SOURCE_CACHE / args.topic_id / digest[:16]
    manifest_path = target / "manifest.json"
    if manifest_path.exists() and not args.force:
        print(f"using cached extraction: {target.relative_to(ROOT)}")
        return 0
    target.mkdir(parents=True, exist_ok=True)
    images_dir = target / "images"
    images_dir.mkdir(exist_ok=True)
    document = pymupdf.open(source)
    pages: list[dict[str, Any]] = []
    seen_xrefs: set[int] = set()
    images: list[dict[str, Any]] = []
    for page_index, page in enumerate(document):
        pages.append({"page": page_index + 1, "text": page.get_text("text")})
        for image_info in page.get_images(full=True):
            xref = image_info[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)
            extracted = document.extract_image(xref)
            raw = extracted["image"]
            image_hash = hashlib.sha256(raw).hexdigest()
            filename = f"p{page_index + 1:04d}-xref{xref}-{image_hash[:12]}.{extracted['ext']}"
            (images_dir / filename).write_bytes(raw)
            images.append({"page": page_index + 1, "xref": xref, "file": f"images/{filename}", "sha256": image_hash})
    write_json(target / "pages.json", pages)
    write_json(
        manifest_path,
        {"source": source.name, "sha256": digest, "pages": len(document), "images": images},
    )
    print(f"extracted {len(document)} pages and {len(images)} unique images to {target.relative_to(ROOT)}")
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate").set_defaults(func=cmd_migrate)
    sub.add_parser("validate").set_defaults(func=cmd_validate)
    sub.add_parser("build").set_defaults(func=cmd_build)
    sub.add_parser("check").set_defaults(func=cmd_check)
    init = sub.add_parser("init-topic")
    init.add_argument("category")
    init.add_argument("topic_id")
    init.add_argument("--label", required=True)
    init.set_defaults(func=cmd_init_topic)
    extract = sub.add_parser("extract-pdf")
    extract.add_argument("topic_id")
    extract.add_argument("pdf")
    extract.add_argument("--force", action="store_true")
    extract.set_defaults(func=cmd_extract_pdf)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        return args.func(args)
    except (PipelineError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
