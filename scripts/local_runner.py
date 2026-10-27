#!/usr/bin/env python3
"""Owner-operated IntMed content runner for a loopback-only LM Studio server.

The runner never receives a Supabase service key and never publishes content.  It authenticates as
an approved IntMed admin, claims one quarantined inbox item through the narrow Edge Function, keeps
the lease alive while a local model works, and submits a schema-checked review draft.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

APP = "intmed-local-runner"
KEYCHAIN_SERVICE = "ir.drgerami.intmed.local-runner"
DEFAULT_CONFIG = Path.home() / ".config" / APP / "config.json"
MAX_SOURCE_BYTES = 20 * 1024 * 1024
CHUNK_CHARS = 6500


class RunnerError(RuntimeError):
    """Expected, user-readable runner failure."""


def request_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None,
                 body: Any = None, timeout: int = 90) -> Any:
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method=method,
                                 headers={"Accept": "application/json", **(headers or {})})
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw or b"null")
    except urllib.error.HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", "replace")
        try:
            message = json.loads(detail).get("message") or json.loads(detail).get("error_description")
        except (ValueError, AttributeError):
            message = None
        raise RunnerError(f"HTTP {exc.code}: {message or 'request failed'}") from None
    except urllib.error.URLError as exc:
        raise RunnerError(f"اتصال برقرار نشد: {exc.reason}") from None


def validate_supabase_url(value: str) -> str:
    value = value.rstrip("/")
    parsed = urllib.parse.urlparse(value)
    allowed = bool(parsed.hostname and (parsed.hostname.endswith(".supabase.co") or parsed.hostname == "api.drgerami-md.ir"))
    if parsed.scheme != "https" or not allowed:
        raise RunnerError("آدرس API باید HTTPS و api.drgerami-md.ir یا دامنهٔ *.supabase.co باشد.")
    return value


def validate_lm_url(value: str) -> str:
    value = value.rstrip("/")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RunnerError("LM Studio باید فقط روی localhost/127.0.0.1 در دسترس باشد.")
    return value if value.endswith("/v1") else value + "/v1"


def load_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        raise RunnerError(f"ابتدا setup را اجرا کنید: {path}") from None
    except (OSError, ValueError) as exc:
        raise RunnerError(f"تنظیمات قابل خواندن نیست: {exc}") from None
    config["supabase_url"] = validate_supabase_url(str(config.get("supabase_url", "")))
    config["lmstudio_url"] = validate_lm_url(str(config.get("lmstudio_url", "http://127.0.0.1:1234/v1")))
    if not config.get("publishable_key") or not config.get("primary_model"):
        raise RunnerError("publishable_key و primary_model باید در تنظیمات باشند.")
    return config


def save_config(path: Path, config: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", "utf-8")
    os.chmod(path, 0o600)


def bundled_publishable_key(config_path: Path | None = None) -> str:
    """Read the public browser key already shipped with the site, when running from the repo."""
    source = config_path or Path(__file__).resolve().parents[1] / "docs" / "config.js"
    try:
        value = source.read_text("utf-8")
    except OSError:
        return ""
    match = re.search(r'["\']supabaseAnonKey["\']\s*:\s*["\']([^"\']+)["\']', value)
    return match.group(1).strip() if match else ""


def keychain_account(config: dict[str, Any]) -> str:
    return urllib.parse.urlparse(config["supabase_url"]).hostname or config["supabase_url"]


def keychain_put(account: str, refresh_token: str) -> None:
    if platform.system() != "Darwin":
        raise RunnerError("ذخیرهٔ خودکار نشست فقط با Keychain مک انجام می‌شود؛ در سیستم دیگر از INTMED_ADMIN_REFRESH_TOKEN استفاده کنید.")
    result = subprocess.run(
        ["/usr/bin/security", "add-generic-password", "-U", "-a", account,
         "-s", KEYCHAIN_SERVICE, "-w", refresh_token],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, check=False,
    )
    if result.returncode:
        raise RunnerError("ذخیرهٔ نشست در Keychain انجام نشد.")


def keychain_get(account: str) -> str:
    from_env = os.environ.get("INTMED_ADMIN_REFRESH_TOKEN", "").strip()
    if from_env:
        return from_env
    if platform.system() != "Darwin":
        raise RunnerError("INTMED_ADMIN_REFRESH_TOKEN تنظیم نشده و Keychain مک در دسترس نیست.")
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-a", account,
         "-s", KEYCHAIN_SERVICE, "-w"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, check=False,
    )
    if result.returncode or not result.stdout.strip():
        raise RunnerError("نشست مدیر در Keychain پیدا نشد؛ setup را دوباره اجرا کنید.")
    return result.stdout.strip()


def auth_headers(config: dict[str, Any]) -> dict[str, str]:
    refresh = keychain_get(keychain_account(config))
    auth = request_json(
        config["supabase_url"] + "/auth/v1/token?grant_type=refresh_token",
        method="POST", headers={"apikey": config["publishable_key"]},
        body={"refresh_token": refresh}, timeout=30,
    )
    if not isinstance(auth, dict) or not auth.get("access_token") or not auth.get("refresh_token"):
        raise RunnerError("تازه‌سازی نشست مدیر ناموفق بود.")
    if auth["refresh_token"] != refresh and platform.system() == "Darwin":
        keychain_put(keychain_account(config), auth["refresh_token"])
    return {"apikey": config["publishable_key"], "Authorization": "Bearer " + auth["access_token"]}


def runner_api(config: dict[str, Any], headers: dict[str, str], body: dict[str, Any], timeout: int = 60) -> Any:
    return request_json(
        config["supabase_url"] + "/functions/v1/intmed-local-runner",
        method="POST", headers=headers, body=body, timeout=timeout,
    )


def list_models(config: dict[str, Any]) -> list[str]:
    result = request_json(config["lmstudio_url"] + "/models", timeout=15)
    return [str(row.get("id")) for row in (result.get("data", []) if isinstance(result, dict) else []) if row.get("id")]


def recommend_models(models: list[str]) -> dict[str, str]:
    """Choose conservative defaults for the owner's known 8 GB LM Studio model set."""
    def first(*needles: str) -> str:
        return next((model for model in models if all(needle in model.casefold() for needle in needles)), "")
    primary = first("qwen3", "4b") or first("qwen", "4b") or first("qwen")
    gemma = first("gemma")
    deepseek = first("deepseek")
    return {"primary_model": primary or (models[0] if models else ""),
            "vision_model": gemma, "style_model": gemma, "review_model": deepseek}


def load_taxonomy() -> list[dict[str, str]]:
    value = request_json("https://drgerami-md.ir/content/taxonomy.json", timeout=30)
    topics: list[dict[str, str]] = []
    for category in value.get("categories", []) if isinstance(value, dict) else []:
        if not isinstance(category, dict):
            continue
        for topic in category.get("topics", []):
            if isinstance(topic, dict) and topic.get("id"):
                topics.append({"id": str(topic["id"]), "label": str(topic.get("label") or ""),
                               "category": str(category.get("label") or "")})
    if not topics:
        raise RunnerError("taxonomy سایت خالی یا غیرقابل دریافت است.")
    return topics


def extract_json(text: str) -> dict[str, Any]:
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.I).strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    if fence:
        text = fence.group(1).strip()
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    raise RunnerError("مدل JSON معتبر برنگرداند.")


def lm_chat(config: dict[str, Any], model: str, messages: list[dict[str, Any]], *,
            temperature: float, max_tokens: int) -> str:
    result = request_json(
        config["lmstudio_url"] + "/chat/completions", method="POST",
        body={"model": model, "messages": messages, "temperature": temperature,
              "max_tokens": max_tokens, "stream": False},
        timeout=int(config.get("model_timeout_seconds", 900)),
    )
    try:
        content = result["choices"][0]["message"]["content"]
    except (TypeError, KeyError, IndexError):
        raise RunnerError("پاسخ LM Studio ساختار شناخته‌شده‌ای ندارد.") from None
    if isinstance(content, list):
        content = "\n".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    return str(content or "")


def lm_json(config: dict[str, Any], model: str, system: str, user: Any, *,
            temperature: float = 0.1, max_tokens: int = 1600) -> dict[str, Any]:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    first = lm_chat(config, model, messages, temperature=temperature, max_tokens=max_tokens)
    try:
        return extract_json(first)
    except RunnerError:
        repaired = lm_chat(
            config, model,
            messages + [{"role": "assistant", "content": first[-12000:]},
                        {"role": "user", "content": "خروجی قبلی JSON معتبر نبود. فقط همان پاسخ را به‌صورت یک شیء JSON معتبر و بدون توضیح بازگردان."}],
            temperature=0, max_tokens=max_tokens,
        )
        return extract_json(repaired)


def split_pages(text: str) -> list[str]:
    pages = text.split("\f")
    return [page.strip() for page in pages if page.strip()]


def extract_pdf(path: Path) -> list[str]:
    try:
        import fitz  # PyMuPDF, already pinned by the repository's dev requirements.
        with fitz.open(path) as document:
            pages = [page.get_text("text", sort=True).strip() for page in document]
        if any(pages):
            return pages
    except ImportError:
        pass
    except Exception as exc:
        raise RunnerError(f"خواندن PDF ناموفق بود: {exc}") from None
    executable = shutil.which("pdftotext")
    if not executable:
        raise RunnerError("برای PDF یکی از این دو را نصب کنید: pip install PyMuPDF یا brew install poppler")
    result = subprocess.run([executable, "-layout", str(path), "-"], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RunnerError("استخراج متن PDF ناموفق بود؛ PDF اسکن‌شده به OCR نیاز دارد.")
    pages = split_pages(result.stdout.decode("utf-8", "replace"))
    if not pages:
        raise RunnerError("PDF متن قابل استخراج ندارد؛ برای نسخهٔ اسکن‌شده مدل vision/OCR لازم است.")
    return pages


def page_chunks(pages: list[str], limit: int = CHUNK_CHARS) -> list[str]:
    chunks: list[str] = []
    current = ""
    for number, page in enumerate(pages, 1):
        marker = f"[PAGE {number}]\n"
        block = "\n" + marker + page.strip() + "\n"
        if len(current) + len(block) > limit and current:
            chunks.append(current.strip())
            current = ""
        if len(block) <= limit:
            current += block
        else:
            payload_limit = max(100, limit - len(marker) - 2)
            for start in range(0, len(page), payload_limit):
                if current:
                    chunks.append(current.strip())
                    current = ""
                chunks.append((marker + page[start:start + payload_limit]).strip())
    if current:
        chunks.append(current.strip())
    return chunks


EXTRACT_SYSTEM = """نقش تو استخراج‌گر شواهد پزشکی است، نه نویسنده. فقط از متن ورودی استفاده کن.
خروجی فقط JSON با کلیدهای headings، facts، warnings، imageCandidates باشد. facts آرایه‌ای از
{claim,page,quote} است؛ quote باید کوتاه و عین متن باشد. اگر صفحه معلوم نیست null بگذار. هیچ خلأیی
را از حافظه پر نکن. متن را فشرده و فارسی نگه دار؛ reasoning یا chain-of-thought را ننویس."""

FINAL_SYSTEM = """تو عامل پیش‌نویس IntMed هستی. فقط با شواهد ورودی کار کن و هیچ دانسته‌ای از حافظه
اضافه نکن. topicId فقط از فهرست مجاز یا null است. همهٔ سؤالات reviewStatus=draft هستند. پاسخ فقط یک
JSON معتبر با کلیدهای suggestedTopicId, confidence, title, sourceSummary, medicalWarnings,
lessonOutline, mcqDrafts, kfDrafts, imageCandidates, sourceEvidence, insufficientEvidence باشد.
هر MCQ دقیقاً stem/options چهارعضوی/correctIndex/explanation/reviewStatus دارد. هر KF فقط prompt و
expectedAnswer و reviewStatus دارد. منبع/صفحه برای ادعاها را در sourceEvidence نگه دار. لحن فارسی
روان و آموزشی باشد، اما عدد، دوز یا ادعای بدون شاهد نساز. reasoning را در خروجی ننویس."""


def compact_chunk(config: dict[str, Any], text: str) -> dict[str, Any]:
    return lm_json(config, config["primary_model"], EXTRACT_SYSTEM, text,
                   temperature=0.1, max_tokens=1400)


def compact_digest(config: dict[str, Any], chunks: list[dict[str, Any]]) -> str:
    encoded = [json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in chunks]
    while sum(map(len, encoded)) > 9000 and len(encoded) > 1:
        merged: list[str] = []
        for start in range(0, len(encoded), 4):
            group = "\n".join(encoded[start:start + 4])
            result = lm_json(
                config, config["primary_model"], EXTRACT_SYSTEM,
                "این چند استخراج را بدون افزودن دانش تازه ادغام و تکرارها را حذف کن:\n" + group,
                temperature=0.1, max_tokens=1400,
            )
            merged.append(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        encoded = merged
    return "\n".join(encoded)


def taxonomy_candidates(taxonomy: list[dict[str, str]], query: str, limit: int = 40) -> list[dict[str, str]]:
    """Keep the final prompt inside a 4k context without guessing a canonical topic ID."""
    normalized = re.sub(r"[^\w\u0600-\u06ff]+", " ", query.casefold())
    query_tokens = {token for token in normalized.split() if len(token) > 1}
    ranked: list[tuple[int, int, dict[str, str]]] = []
    for index, row in enumerate(taxonomy):
        haystack = " ".join(str(row.get(key, "")) for key in ("id", "label", "category")).casefold()
        tokens = {token for token in re.sub(r"[^\w\u0600-\u06ff]+", " ", haystack).split() if len(token) > 1}
        label = str(row.get("label", "")).casefold().strip()
        score = 3 * len(query_tokens & tokens) + (12 if label and label in normalized else 0)
        ranked.append((score, -index, row))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    positive = [row for score, _, row in ranked if score > 0]
    return (positive or [row for _, _, row in ranked])[:limit]


def vision_digest(config: dict[str, Any], path: Path, mime: str, caption: str) -> str:
    model = str(config.get("vision_model") or "").strip()
    if not model:
        raise RunnerError("این ورودی تصویری است؛ در setup یک vision_model (مثلاً Gemma سازگار با تصویر) انتخاب کنید.")
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    user = [{"type": "text", "text": "تصویر پزشکی را فقط توصیف/OCR کن. برچسب‌ها، یافته‌های قابل مشاهده و ابهام‌ها را با JSON facts/warnings/imageCandidates بده. توضیح مدیر: " + caption},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}]
    result = lm_json(config, model, EXTRACT_SYSTEM, user, temperature=0.1, max_tokens=1400)
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))


def validate_draft(value: Any, allowed_topics: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RunnerError("پیش‌نویس شیء JSON نیست.")
    required = {"suggestedTopicId", "confidence", "title", "sourceSummary", "medicalWarnings",
                "lessonOutline", "mcqDrafts", "kfDrafts", "imageCandidates", "sourceEvidence",
                "insufficientEvidence"}
    if not required.issubset(value):
        raise RunnerError("پیش‌نویس بعضی فیلدهای اجباری را ندارد: " + ", ".join(sorted(required - set(value))))
    for key in ("medicalWarnings", "lessonOutline", "mcqDrafts", "kfDrafts", "imageCandidates", "sourceEvidence", "insufficientEvidence"):
        if not isinstance(value[key], list):
            raise RunnerError(f"{key} باید آرایه باشد.")
    topic = value["suggestedTopicId"]
    if topic is not None and topic not in allowed_topics:
        value["suggestedTopicId"] = None
        value["medicalWarnings"].append("topicId پیشنهادی در taxonomy مجاز نبود و حذف شد.")
    try:
        value["confidence"] = max(0.0, min(1.0, float(value["confidence"])))
    except (TypeError, ValueError):
        raise RunnerError("confidence معتبر نیست.") from None
    if not isinstance(value["title"], str) or not value["title"].strip():
        raise RunnerError("عنوان پیش‌نویس خالی است.")
    for item in value["mcqDrafts"]:
        if not isinstance(item, dict) or not isinstance(item.get("options"), list) or len(item["options"]) != 4:
            raise RunnerError("هر سؤال چهارگزینه‌ای باید دقیقاً چهار گزینه داشته باشد.")
        if isinstance(item.get("correctIndex"), bool) or not isinstance(item.get("correctIndex"), int) or item["correctIndex"] not in range(4):
            raise RunnerError("correctIndex سؤال معتبر نیست.")
        item["reviewStatus"] = "draft"
    for item in value["kfDrafts"]:
        if not isinstance(item, dict) or not item.get("prompt") or not item.get("expectedAnswer"):
            raise RunnerError("ساختار KF ناقص است.")
        item["reviewStatus"] = "draft"
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 500_000:
        raise RunnerError("پیش‌نویس بیش از حد بزرگ است.")
    return value


def humanize(config: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    model = str(config.get("style_model") or "").strip()
    if not model:
        return draft
    source = {"title": draft["title"], "sourceSummary": draft["sourceSummary"], "lessonOutline": draft["lessonOutline"]}
    styled = lm_json(
        config, model,
        "ویراستار فارسی هستی. بدون تغییر هیچ واقعیت، عدد، دوز، صفحه یا ترتیب، لحن ماشینی را طبیعی و آموزشی کن. فقط JSON با همان سه کلید برگردان.",
        json.dumps(source, ensure_ascii=False), temperature=0.2, max_tokens=1800,
    )
    numeral = r"[0-9۰-۹٠-٩]+(?:[./][0-9۰-۹٠-٩]+)?"
    before = re.findall(numeral, json.dumps(source, ensure_ascii=False))
    after = re.findall(numeral, json.dumps(styled, ensure_ascii=False))
    if before != after or set(styled) != set(source):
        draft["medicalWarnings"].append("خروجی ویراستار به‌علت تغییر احتمالی داده‌ها پذیرفته نشد.")
        return draft
    draft.update(styled)
    return draft


def targeted_review(config: dict[str, Any], draft: dict[str, Any], digest: str) -> dict[str, Any]:
    model = str(config.get("review_model") or "").strip()
    if not model:
        return draft
    result = lm_json(
        config, model,
        "بازبین محدود هستی. فقط خطا/تناقض پیش‌نویس نسبت به شواهد را پیدا کن. پاسخ JSON با issues (آرایه رشته) باشد. reasoning را ننویس و چیزی را خودکار اصلاح نکن.",
        "شواهد:\n" + digest[:7000] + "\nپیش‌نویس:\n" + json.dumps(draft, ensure_ascii=False)[:7000],
        temperature=0.1, max_tokens=900,
    )
    for issue in result.get("issues", []) if isinstance(result.get("issues"), list) else []:
        if isinstance(issue, str) and issue.strip():
            draft["medicalWarnings"].append("بازبینی DeepSeek: " + issue.strip()[:1000])
    return draft


def download_source(config: dict[str, Any], job: dict[str, Any], destination: Path) -> None:
    url = str(job.get("downloadUrl") or "")
    parsed = urllib.parse.urlparse(url)
    expected_host = urllib.parse.urlparse(config["supabase_url"]).hostname
    signed_prefix = "/storage/v1/object/sign/intmed-content-inbox/"
    if parsed.scheme != "https" or not parsed.hostname or not parsed.path.startswith(signed_prefix):
        raise RunnerError("آدرس دانلود امضاشده خارج از bucket خصوصی مورد انتظار است.")
    if parsed.hostname != expected_host:
        url = urllib.parse.urlunparse(parsed._replace(netloc=expected_host or "", scheme="https"))
    req = urllib.request.Request(url, headers={"Accept": "application/octet-stream"})
    try:
        with urllib.request.urlopen(req, timeout=120) as response, destination.open("wb") as target:
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise RunnerError("فایل از سقف ۲۰ مگابایت بزرگ‌تر است.")
                target.write(chunk)
    except urllib.error.URLError as exc:
        raise RunnerError(f"دانلود فایل ناموفق بود: {exc.reason}") from None
    expected = str(job.get("sha256") or "")
    if expected and hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
        raise RunnerError("هش فایل دانلودشده با رکورد صندوق مطابقت ندارد.")


class Heartbeat:
    def __init__(self, config: dict[str, Any], headers: dict[str, str], job: dict[str, Any]):
        self.config, self.headers, self.job = config, headers, job
        self.stop_event, self.lost = threading.Event(), threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.last_auth = time.monotonic()

    def __enter__(self) -> "Heartbeat":
        self.thread.start()
        return self

    def __exit__(self, *_: Any) -> None:
        self.stop_event.set()
        self.thread.join(timeout=3)

    def _run(self) -> None:
        failures = 0
        while not self.stop_event.wait(60):
            try:
                if time.monotonic() - self.last_auth > 2400:
                    self.headers = auth_headers(self.config)
                    self.last_auth = time.monotonic()
                result = runner_api(self.config, self.headers, {
                    "action": "heartbeat", "runnerId": self.config["runner_id"],
                    "ingestId": self.job["ingestId"], "leaseToken": self.job["leaseToken"],
                })
                if not result.get("ok"):
                    failures += 1
                else:
                    failures = 0
            except RunnerError:
                failures += 1
            if failures >= 3:
                self.lost.set()
                return


def process_job(config: dict[str, Any], headers: dict[str, str], job: dict[str, Any]) -> tuple[dict[str, Any], str]:
    taxonomy = job.get("taxonomy") or load_taxonomy()
    allowed = {str(row.get("id")) for row in taxonomy if isinstance(row, dict) and row.get("id")}
    with tempfile.TemporaryDirectory(prefix="intmed-local-") as folder:
        kind = str(job.get("kind") or "")
        if kind == "text":
            chunks = page_chunks([str(job.get("contentText") or "")])
            extracted = [compact_chunk(config, chunk) for chunk in chunks]
            digest = compact_digest(config, extracted)
        else:
            suffix = Path(str(job.get("originalFilename") or "source.bin")).suffix or (".pdf" if kind == "pdf" else ".img")
            source = Path(folder) / ("source" + suffix)
            download_source(config, job, source)
            if kind == "pdf":
                extracted = [compact_chunk(config, chunk) for chunk in page_chunks(extract_pdf(source))]
                digest = compact_digest(config, extracted)
            elif kind == "image":
                digest = vision_digest(config, source, str(job.get("mimeType") or "image/jpeg"), str(job.get("caption") or ""))
            else:
                raise RunnerError("نوع ورودی پشتیبانی نمی‌شود.")
    routing_query = str(job.get("topicHint") or "") + " " + str(job.get("caption") or "") + " " + digest[:4000]
    candidates = taxonomy_candidates([row for row in taxonomy if isinstance(row, dict)], routing_query)
    topic_list = "\n".join(f"{row.get('id')} | {row.get('category','')} | {row.get('label','')}" for row in candidates)
    user = ("فهرست topicIdهای مجاز:\n" + topic_list + "\n\nراهنمای فارسی مدیر: " +
            str(job.get("topicHint") or "") + "\nتوضیح فایل: " + str(job.get("caption") or "") +
            "\n\nشواهد استخراج‌شده:\n" + digest[:9000])
    draft = lm_json(config, config["primary_model"], FINAL_SYSTEM, user,
                    temperature=0.3, max_tokens=int(config.get("final_max_tokens", 5000)))
    draft = validate_draft(draft, allowed)
    draft = humanize(config, draft)
    draft = targeted_review(config, draft, digest)
    return validate_draft(draft, allowed), digest


def run_once(config: dict[str, Any]) -> bool:
    headers = auth_headers(config)
    response = runner_api(config, headers, {"action": "claim", "runnerId": config["runner_id"]})
    job = response.get("job") if isinstance(response, dict) else None
    if not job:
        print("صف محلی خالی است.")
        return False
    job = dict(job)
    job["ingestId"] = job.get("ingestId") or job.get("id")
    job["leaseToken"] = job.get("leaseToken") or response.get("leaseToken")
    job["originalFilename"] = job.get("originalFilename") or job.get("filename")
    if not job.get("ingestId") or not job.get("leaseToken"):
        raise RunnerError("پاسخ claim شناسه یا leaseToken ندارد.")
    short = str(job.get("ingestId", ""))[:8]
    print(f"دریافت شد: {short} — {job.get('originalFilename') or job.get('kind')}")
    with Heartbeat(config, headers, job) as heartbeat:
        try:
            draft, extracted = process_job(config, headers, job)
            if heartbeat.lost.is_set():
                raise RunnerError("lease پس از سه heartbeat ناموفق از دست رفت؛ خروجی ارسال نشد.")
            result = runner_api(config, heartbeat.headers, {
                "action": "submit", "runnerId": config["runner_id"],
                "ingestId": job["ingestId"], "leaseToken": job["leaseToken"],
                "draft": draft,
                "extractedText": extracted[:120000], "model": config["primary_model"],
                "promptVersion": "intmed-local-v1",
                "modelReport": {"primary": config["primary_model"],
                                "vision": config.get("vision_model") or None,
                                "style": config.get("style_model") or None,
                                "review": config.get("review_model") or None},
            }, timeout=90)
            if not result.get("ok"):
                raise RunnerError("سرور پیش‌نویس را نپذیرفت.")
            print(f"پیش‌نویس {short} برای بازبینی ثبت شد؛ چیزی منتشر نشده است.")
            return True
        except Exception as exc:
            code = "runner_error"
            if isinstance(exc, RunnerError) and "vision_model" in str(exc):
                code = "vision_model_required"
            try:
                runner_api(config, heartbeat.headers, {
                    "action": "fail", "runnerId": config["runner_id"],
                    "ingestId": job["ingestId"], "leaseToken": job["leaseToken"],
                    "errorCode": code, "errorMessage": str(exc)[:500], "model": config["primary_model"],
                })
            except RunnerError:
                pass
            raise


def setup(path: Path) -> None:
    print("تنظیم Runner محلی IntMed — هیچ service_role یا رمز عبوری ذخیره نمی‌شود.")
    supabase_url = validate_supabase_url(input("API URL [https://api.drgerami-md.ir]: ").strip() or "https://api.drgerami-md.ir")
    publishable = bundled_publishable_key()
    if publishable:
        print("کلید عمومی سایت به‌طور خودکار از docs/config.js خوانده شد.")
    else:
        publishable = getpass.getpass("Publishable/anon key (نمایش داده نمی‌شود): ").strip()
    if not publishable:
        raise RunnerError("کلید عمومی Supabase پیدا یا وارد نشد.")
    lm_url = validate_lm_url(input("LM Studio URL [http://127.0.0.1:1234/v1]: ").strip() or "http://127.0.0.1:1234/v1")
    provisional = {"supabase_url": supabase_url, "publishable_key": publishable, "lmstudio_url": lm_url}
    models = list_models(provisional)
    if not models:
        raise RunnerError("هیچ مدل بارگذاری‌شده‌ای در LM Studio دیده نشد.")
    print("مدل‌ها:\n" + "\n".join(f"  {index + 1}. {model}" for index, model in enumerate(models)))
    recommended = recommend_models(models)
    print("\nپیشنهاد خودکار برای رم ۸ گیگ:")
    print("  مدل اصلی:", recommended["primary_model"] or "پیدا نشد")
    print("  تصویر/ویرایش:", recommended["vision_model"] or "خاموش")
    print("  بازبینی اختیاری:", recommended["review_model"] or "خاموش")
    use_recommended = input("همین انتخاب امن استفاده شود؟ [Y/n]: ").strip().casefold() not in {"n", "no", "خیر"}
    def choose(label: str, required: bool = False) -> str:
        raw = input(label).strip()
        if not raw and not required:
            return ""
        try:
            return models[int(raw) - 1]
        except (ValueError, IndexError):
            raise RunnerError("شمارهٔ مدل معتبر نیست.") from None
    if use_recommended:
        primary, vision, style, review = (recommended[key] for key in
                                          ("primary_model", "vision_model", "style_model", "review_model"))
    else:
        primary = choose("شمارهٔ Qwen اصلی: ", True)
        vision = choose("شمارهٔ مدل vision/Gemma (اختیاری، Enter برای خاموش): ")
        style = choose("شمارهٔ Gemma برای ویراستاری (اختیاری): ")
        review = choose("شمارهٔ DeepSeek برای بازبینی (اختیاری و کند): ")
    email = input("ایمیل حساب مدیر IntMed: ").strip()
    password = getpass.getpass("رمز حساب مدیر (فقط همین لحظه): ")
    auth = request_json(supabase_url + "/auth/v1/token?grant_type=password", method="POST",
                        headers={"apikey": publishable}, body={"email": email, "password": password}, timeout=30)
    password = ""
    if not auth.get("refresh_token"):
        raise RunnerError("ورود مدیر ناموفق بود.")
    config = {**provisional, "runner_id": str(uuid.uuid4()), "primary_model": primary,
              "vision_model": vision, "style_model": style, "review_model": review,
              "poll_seconds": 20, "model_timeout_seconds": 900, "final_max_tokens": 1600}
    headers = {"apikey": publishable, "Authorization": "Bearer " + auth["access_token"]}
    status = runner_api(config, headers, {"action": "status", "runnerId": config["runner_id"]})
    if not status.get("ok"):
        raise RunnerError("حساب واردشده دسترسی مدیر Runner ندارد.")
    keychain_put(keychain_account(config), auth["refresh_token"])
    save_config(path, config)
    print(f"تنظیمات امن ذخیره شد: {path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IntMed LM Studio local content runner")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("setup")
    sub.add_parser("models")
    sub.add_parser("status")
    sub.add_parser("once")
    watch = sub.add_parser("watch")
    watch.add_argument("--poll-seconds", type=int)
    args = parser.parse_args(argv)
    try:
        if args.command == "setup":
            setup(args.config)
            return 0
        config = load_config(args.config)
        if args.command == "models":
            print("\n".join(list_models(config)) or "هیچ مدل بارگذاری نشده است.")
            return 0
        if args.command == "status":
            models = list_models(config)
            status = runner_api(config, auth_headers(config), {"action": "status", "runnerId": config["runner_id"]})
            print(json.dumps({"lmStudio": "online", "configuredModels": {key: config.get(key) for key in ("primary_model", "vision_model", "style_model", "review_model")}, "availableModels": models, "queue": status}, ensure_ascii=False, indent=2))
            return 0
        if args.command == "once":
            run_once(config)
            return 0
        interval = max(10, min(300, args.poll_seconds or int(config.get("poll_seconds", 20))))
        stopped = False
        def stop(*_: Any) -> None:
            nonlocal stopped
            stopped = True
        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        print(f"Runner فعال است؛ بررسی صف هر {interval} ثانیه. برای توقف Ctrl+C بزنید.")
        while not stopped:
            try:
                worked = run_once(config)
            except RunnerError as exc:
                print("خطا:", exc, file=sys.stderr)
                worked = False
            for _ in range((3 if worked else interval) * 2):
                if stopped:
                    break
                time.sleep(0.5)
        return 0
    except RunnerError as exc:
        print("خطا:", exc, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
