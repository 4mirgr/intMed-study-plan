import json, argparse, shutil, pathlib

def load(p): return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
def save(p, d): pathlib.Path(p).write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

def publish_text(content_id, topic, mode, position):
    data_path = f"content/{topic}/data.json"
    data = load(data_path)
    item = load(f"content/_inbox/{content_id}.json")  # محتوای تأییدشده

    if mode == "append":
        data["sections"].append(item["section"])
    elif mode == "insert":
        idx = int(position) if position.isdigit() else next(
            i for i, s in enumerate(data["sections"]) if s.get("key") == position)
        data["sections"].insert(idx, item["section"])
    save(data_path, data)

def publish_image(content_id, topic):
    item = load(f"content/_inbox/{content_id}.json")
    src = pathlib.Path(item["image_path"])
    dst = pathlib.Path("docs/assets") / topic / src.name
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)

    data_path = f"content/{topic}/data.json"
    data = load(data_path)
    data.setdefault("gallery", []).append({
        "src": f"assets/{topic}/{src.name}",
        "caption": item.get("caption", ""),
        "alt": item.get("alt", "")
    })
    save(data_path, data)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--content-id", required=True)
    ap.add_argument("--topic", required=True)
    ap.add_argument("--mode", choices=["append","insert","image-gallery"], required=True)
    ap.add_argument("--position", default="")
    a = ap.parse_args()
    if a.mode == "image-gallery":
        publish_image(a.content_id, a.topic)
    else:
        publish_text(a.content_id, a.topic, a.mode, a.position)
