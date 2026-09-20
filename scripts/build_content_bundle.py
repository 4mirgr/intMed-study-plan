#!/usr/bin/env python3
"""Rebuilds docs/content-bundle.json from content/<category>/<topicId>/data.json files.

This is the static-site fallback data source used by docs/index.html when
window.claude (the live artifact db) isn't available. Run this after adding
or editing any content/*/*/data.json file, then commit docs/content-bundle.json
alongside the source change.
"""
import json
import glob
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Some data.json files reference images via /_blob/<id> — an artifact-only
# path that only resolves inside claude.ai. For the public static site we
# substitute a locally-hosted copy under docs/assets/. Keyed by
# "<topicId>:<image index>" -> replacement sourceUrl (relative to docs/).
BLOB_OVERRIDES = {
    "cardio-hf:0": "assets/heart-failure-mortality-figure.jpg",
}

FIELDS = ["flashcards", "mcq", "kfPmp", "images", "tables", "lesson"]


def main():
    bundle = {}
    for data_path in sorted(glob.glob(os.path.join(REPO_ROOT, "content", "*", "*", "data.json"))):
        data = json.load(open(data_path, encoding="utf-8"))
        topic_id = data["topicId"]
        entry = {field: data.get(field, []) for field in FIELDS}
        for i, img in enumerate(entry.get("images", [])):
            key = f"{topic_id}:{i}"
            if key in BLOB_OVERRIDES:
                img["sourceUrl"] = BLOB_OVERRIDES[key]
        bundle[topic_id] = entry

    out_path = os.path.join(REPO_ROOT, "docs", "content-bundle.json")
    json.dump(bundle, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"wrote {out_path} — {len(bundle)} topics")


if __name__ == "__main__":
    main()
