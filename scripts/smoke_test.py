#!/usr/bin/env python3
"""HTTP smoke test for the generated static site."""

from __future__ import annotations

import contextlib
import http.server
import json
import threading
import urllib.request
from functools import partial
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=10) as response:
        if response.status != 200:
            raise RuntimeError(f"{url}: HTTP {response.status}")
        return response.read()


def main() -> int:
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=ROOT / "docs")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        index = get(base + "/").decode("utf-8")
        taxonomy = json.loads(get(base + "/content/taxonomy.json"))
        manifest = json.loads(get(base + "/content/manifest.json"))
        topic_id = "cardio-ecg"
        topic = json.loads(get(base + "/" + manifest["topics"][topic_id]["path"]))
        assert "content-bundle.json" not in index
        assert len(taxonomy["categories"]) >= 10
        assert len(manifest["topics"]) >= 69
        assert topic["lesson"] and topic["mcq"]
        first_local_image = next(
            (image for image in topic["images"] if image.get("sourceUrl", "").startswith("content/images/")),
            None,
        )
        if first_local_image:
            assert get(base + "/" + first_local_image["sourceUrl"])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    print("HTTP smoke test passed: index, taxonomy, manifest, lazy topic, and image")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
