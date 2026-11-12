#!/usr/bin/env python3
"""Stage curated openly licensed PBS originals; publish only after visual approval.

No crawling, model calls, credentials, or automatic clinical approval. Edit the reviewed
manifest, inspect the staged originals, then set visualApproved=true per suitable image.
"""
import argparse
from email.utils import parsedate_to_datetime
import io
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 10 * 1024 * 1024
LICENSES = {
    'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
}


def validate_entry(entry):
    for key in ('id', 'category', 'topicId'):
        if not isinstance(entry.get(key), str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', entry[key]):
            raise ValueError(f'Unsafe {key}')
    for key in ('fileName', 'sourcePage', 'creator', 'caption', 'note'):
        if not isinstance(entry.get(key), str) or not entry[key].strip():
            raise ValueError(f'Missing {key}')
    if type(entry.get('visualApproved')) is not bool or entry.get('reviewStatus') != 'draft':
        raise ValueError('Explicit visualApproved boolean and draft reviewStatus required')
    if LICENSES.get(entry.get('license')) != entry.get('licenseUrl'):
        raise ValueError('Unsupported or mismatched open license')
    for key in ('width', 'height'):
        if type(entry.get(key)) is not int or not 400 <= entry[key] <= 10000:
            raise ValueError(f'Invalid expected {key}')
    url = urllib.parse.urlsplit(entry.get('imageUrl', ''))
    if (url.scheme != 'https' or url.netloc != 'upload.wikimedia.org' or url.query or url.fragment
            or not re.fullmatch(r'/wikipedia/commons/[a-f0-9]/[a-f0-9]{2}/[^/]+\.(?:jpg|JPG|jpeg)', url.path)
            or urllib.parse.unquote(url.path.rsplit('/', 1)[-1]) != entry['fileName']):
        raise ValueError('Only exact Wikimedia Commons original JPEG URLs are allowed')
    page = urllib.parse.urlsplit(entry['sourcePage'])
    if (page.scheme != 'https' or page.netloc != 'commons.wikimedia.org' or page.query or page.fragment
            or urllib.parse.unquote(page.path) != '/wiki/File:' + entry['fileName']):
        raise ValueError('Source page does not match the original filename')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ValueError('Image redirects are not allowed; use the reviewed original URL')


def download(url, max_bytes=MAX_BYTES):
    request = urllib.request.Request(url, headers={
        'User-Agent': 'IntMed-PBS-Curated-Importer/1.0 (https://github.com/4mirgr/intMed-study-plan)',
        'Accept': 'image/jpeg',
    })
    opener = urllib.request.build_opener(NoRedirect)
    delay = 1
    for attempt in range(3):
        time.sleep(delay)  # Pace every real request, including retries, without slowing injected fetches.
        try:
            with opener.open(request, timeout=60) as response:
                if response.status != 200 or response.headers.get_content_type() != 'image/jpeg':
                    raise ValueError('Expected HTTP 200 image/jpeg')
                body = response.read(max_bytes + 1)
            break
        except urllib.error.HTTPError as error:
            error.close()
            if error.code != 429 or attempt == 2:
                raise
            retry_after = (error.headers.get('Retry-After') or '').strip()
            delay = 1
            if re.fullmatch(r'[0-9]+', retry_after):
                delay = float(retry_after)
            elif retry_after:
                try:
                    date = parsedate_to_datetime(retry_after)
                    if date.tzinfo is not None:
                        delay = date.timestamp() - time.time()
                except (ValueError, TypeError, OverflowError):
                    pass
            if delay > 60:
                raise  # Never clamp a server's longer cooldown and retry early.
            delay = max(1, delay)
    if len(body) > max_bytes:
        raise ValueError('Image exceeds download size limit')
    return body


def validate_jpeg(body, entry, max_bytes):
    if not isinstance(body, bytes) or len(body) > max_bytes:
        raise ValueError('Image exceeds size limit or is not binary')
    try:
        with Image.open(io.BytesIO(body)) as image:
            if image.format != 'JPEG' or image.size != (entry['width'], entry['height']):
                raise ValueError('Original JPEG dimensions do not match the reviewed manifest')
            image.verify()
        with Image.open(io.BytesIO(body)) as image:
            image.load()  # Reject truncated entropy data, not just a plausible JPEG header.
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError('Invalid or incomplete JPEG') from error


def import_entries(root, entries, fetch=None, max_bytes=MAX_BYTES):
    root = Path(root).resolve()
    fetch = fetch or (lambda url: download(url, max_bytes))
    plans = []
    topics = {}
    seen = set()
    for entry in entries:
        validate_entry(entry)
        if entry['id'] in seen:
            raise ValueError('Duplicate manifest image ID')
        seen.add(entry['id'])
        topic = root / 'content' / entry['category'] / entry['topicId']
        data_path = topic / 'data.json'
        asset_path = topic / 'assets' / (entry['id'] + '.jpg')
        for path in (data_path, asset_path):
            if path.resolve() != path or not path.is_relative_to(root):
                raise ValueError('Symlink or unsafe destination')
        if data_path not in topics:
            topics[data_path] = json.loads(data_path.read_text(encoding='utf-8'))
        data = topics[data_path]
        if data.get('topicId') != entry['topicId'] or data.get('category') != entry['category']:
            raise ValueError('Topic identity mismatch')
        if asset_path.exists():
            body = asset_path.read_bytes()
        else:
            try:
                body = fetch(entry['imageUrl'])
            except Exception as error:
                reason = f'HTTP {error.code}' if isinstance(error, urllib.error.HTTPError) else type(error).__name__
                raise ValueError(f"Image {entry['id']}: download failed ({reason})") from None
        validate_jpeg(body, entry, max_bytes)
        if entry['visualApproved']:
            source_id = entry['id'] + '-source'
            source = {
                'id': source_id, 'title': entry['fileName'], 'type': 'image',
                'sourceClass': 'open-license', 'creator': entry['creator'],
                'sourceUrl': entry['sourcePage'], 'license': entry['license'],
                'licenseUrl': entry['licenseUrl'], 'note': 'Original Wikimedia Commons JPEG; no visual modifications.',
            }
            changes_note = 'اصل تصویر بدون تغییر؛ شرح فارسی آموزشی افزوده شده است.'
            image = {
                'id': entry['id'], 'caption': entry['caption'], 'note': entry['note'] + ' ' + changes_note + ' شرح آموزشی پیش‌نویس است و به بازبینی مدرس نیاز دارد.',
                'assetPath': 'assets/' + entry['id'] + '.jpg', 'kind': 'pbs',
                'sourceClass': 'open-license', 'sourceUrl': entry['sourcePage'],
                'creator': entry['creator'], 'license': entry['license'], 'licenseUrl': entry['licenseUrl'],
                'credit': entry['creator'], 'licenseLabel': entry['license'],
                'originUrl': entry['sourcePage'], 'changesNote': changes_note,
                'copyright': f"{entry['creator']} — {entry['license']} — {entry['sourcePage']}",
                'reviewStatus': 'draft', 'width': entry['width'], 'height': entry['height'],
                'sourceRefs': [{'sourceId': source_id}],
            }
            for key, record in (('sources', source), ('images', image)):
                existing = [item for item in data.get(key, []) if item.get('id') == record['id']]
                if existing and (len(existing) != 1 or existing[0] != record):
                    raise ValueError(f'Existing {key} ID conflicts with manifest; refusing overwrite')
                if not existing:
                    data.setdefault(key, []).append(record)
        plans.append((asset_path, body, entry['visualApproved']))
    # Validate the entire batch before touching canonical files or assets.
    for asset_path, body, approved in plans:
        if not asset_path.exists():
            asset_path.parent.mkdir(parents=True, exist_ok=True)
            asset_path.write_bytes(body)
    for data_path, data in topics.items():
        if json.loads(data_path.read_text(encoding='utf-8')) != data:
            data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'staged': len(plans), 'published': sum(approved for _, _, approved in plans)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=ROOT / 'content/_imports/pbs-open-license.json')
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    if manifest.get('version') != 1 or not isinstance(manifest.get('images'), list):
        raise ValueError('Invalid curated PBS manifest')
    print(json.dumps(import_entries(ROOT, manifest['images']), ensure_ascii=False))


if __name__ == '__main__':
    main()
