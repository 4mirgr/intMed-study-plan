#!/usr/bin/env python3
"""Run one capability-scoped private content job, without model or service credentials."""
from __future__ import annotations

import hashlib
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ENDPOINT = "https://upwbktvnybsjugdegjji.supabase.co/functions/v1/intmed-content-jobs"
SOURCE_HOST = "upwbktvnybsjugdegjji.supabase.co"
MAX_SOURCE_BYTES = 20 * 1024 * 1024
MAX_RESULT_BYTES = 8 * 1024 * 1024
MAX_FIGURES = 80
MAX_FIGURE_BYTES = 5 * 1024 * 1024
MAX_FIGURE_TOTAL = 30 * 1024 * 1024


class ProcessingError(RuntimeError):
    """Public error code only; never include source text, signed URLs or tokens."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProcessingError("source_redirect_blocked")


def validate_source_url(value: str) -> str:
    try:
        parsed = urllib.parse.urlparse(value)
        path = urllib.parse.unquote(parsed.path)
        if (parsed.scheme != "https" or parsed.hostname != SOURCE_HOST or
                parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment or
                not path.startswith("/storage/v1/object/sign/intmed-content-inbox/") or
                ".." in path.split("/") or not urllib.parse.parse_qs(parsed.query).get("token")):
            raise ValueError()
    except (TypeError, ValueError):
        raise ProcessingError("source_url_not_allowed") from None
    return value


def download_source(source: dict[str, Any]) -> bytes:
    url = validate_source_url(str(source.get("downloadUrl") or ""))
    if source.get("mimeType") != "application/pdf":
        raise ProcessingError("native_extraction_requires_pdf")
    request = urllib.request.Request(url, headers={"Accept": "application/pdf"})
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=90) as response:
            validate_source_url(response.geturl())
            raw = response.read(MAX_SOURCE_BYTES + 1)
    except ProcessingError:
        raise
    except (OSError, ValueError):
        raise ProcessingError("source_download_failed") from None
    if not raw or len(raw) > MAX_SOURCE_BYTES:
        raise ProcessingError("source_size_invalid")
    expected = source.get("sha256")
    if expected and (not re.fullmatch(r"[0-9a-fA-F]{64}", str(expected)) or
                     hashlib.sha256(raw).hexdigest() != str(expected).lower()):
        raise ProcessingError("source_hash_mismatch")
    return raw


def extract_pdf(raw: bytes) -> dict[str, Any]:
    import pymupdf

    try:
        document = pymupdf.open(stream=raw, filetype="pdf")
    except Exception:
        raise ProcessingError("pdf_invalid") from None
    with document:
        if document.needs_pass:
            raise ProcessingError("pdf_password_required")
        if not 1 <= document.page_count <= 2000:
            raise ProcessingError("pdf_page_count_invalid")
        pages: list[dict[str, Any]] = []
        figures: list[dict[str, Any]] = []
        warnings: list[str] = []
        rtl_pages: list[int] = []
        for index in range(document.page_count):
            page = document.load_page(index)
            # Spatial top-left sorting imposes LTR word order on Persian PDFs.
            # Prefer the PDF creator's sequence when Arabic/Hebrew letters form
            # a meaningful part of the page; never reverse characters or doses.
            creator_text = page.get_text("text", sort=False).replace("\x00", "").strip()
            letters = sum(character.isalpha() for character in creator_text)
            rtl_letters = sum(character.isalpha() and
                              ("\u0590" <= character <= "\u08ff" or
                               "\ufb1d" <= character <= "\ufdff" or
                               "\ufe70" <= character <= "\ufeff")
                              for character in creator_text)
            if letters and rtl_letters / letters >= .15:
                content = creator_text
                rtl_pages.append(index + 1)
            else:
                content = page.get_text("text", sort=True).replace("\x00", "").strip()
            if len(content) > 100_000:
                raise ProcessingError("pdf_page_text_limit")
            useful = sum(character.isalnum() for character in content)
            corrupt = bool(content) and content.count("\ufffd") / len(content) > .02
            unreadable = useful < 20 or corrupt
            method = "needs_ocr" if unreadable else "native_text"
            if not content and not page.get_images() and not page.get_drawings():
                method = "blank_page"
                unreadable = False
            lines = [line.strip() for line in content.splitlines() if line.strip()]
            pages.append({"page": index + 1, "heading": (lines[0] if lines else "")[:240],
                          "text": content, "unreadable": unreadable, "method": method})
            seen: set[int] = set()
            for image in page.get_images(full=True):
                xref = image[0]
                if not xref or xref in seen:
                    continue
                seen.add(xref)
                if len(figures) >= 10000:
                    raise ProcessingError("pdf_figure_limit")
                image_data = document.extract_image(xref)
                if image_data:
                    figures.append({"page": index + 1, "xref": xref,
                                    "width": image_data["width"], "height": image_data["height"],
                                    "extension": image_data.get("ext", ""),
                                    "sha256": hashlib.sha256(image_data["image"]).hexdigest()})
        if any(page["unreadable"] for page in pages):
            warnings.append("برخی صفحات متن خوانای کافی ندارند و به OCR یا بررسی تصویر نیاز دارند.")
        if rtl_pages:
            warnings.append("ترتیب ثبت‌شدهٔ متن فارسی/راست‌به‌چپ در PDF حفظ شد؛ ترتیب خواندن باید با صفحهٔ منبع تطبیق داده شود.")
        if figures:
            warnings.append("فهرست تصاویر از PDF استخراج شده؛ فایل تصاویر هنوز برای انتشار انتخاب یا تأیید نشده است.")
        result = {"pageCount": document.page_count, "pages": pages,
                  "warnings": warnings, "figures": figures}
        if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > MAX_RESULT_BYTES - 2048:
            raise ProcessingError("extraction_payload_too_large")
        return result


def apply_selective_ocr(raw: bytes, extraction: dict[str, Any], job: dict[str, Any],
                        job_id: str, capability: str) -> dict[str, Any]:
    """Only unreadable nonblank pages reach the existing private Gemini bridge."""
    import pymupdf

    progress = job.get("progress") if isinstance(job.get("progress"), dict) else {}
    cached = progress.get("ocrPages") if isinstance(progress.get("ocrPages"), dict) else {}
    with pymupdf.open(stream=raw, filetype="pdf") as document:
        for record in extraction["pages"]:
            if not record["unreadable"] or record["method"] == "blank_page":
                continue
            page_number = record["page"]
            result = cached.get(str(page_number))
            if isinstance(result, str):
                result = {"text": result, "unreadable": not bool(result.strip())}
            if not isinstance(result, dict):
                page = document.load_page(page_number - 1)
                size = max(page.rect.width, page.rect.height)
                image = b""
                for pixels in (1600, 1200, 900):
                    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(pixels / size, pixels / size), alpha=False)
                    image = pixmap.tobytes("png")
                    if len(image) <= 2 * 1024 * 1024:
                        break
                if len(image) > 2 * 1024 * 1024:
                    raise ProcessingError("ocr_page_image_too_large")
                result = api(job_id, capability, "ocr_page", page=page_number,
                             imageBase64=base64.b64encode(image).decode("ascii"))
            if result.get("page", page_number) != page_number or not isinstance(result.get("text"), str):
                raise ProcessingError("ocr_page_response_invalid")
            content = result["text"].strip()
            if len(content) > 100_000:
                raise ProcessingError("ocr_page_text_limit")
            record.update(text=content, unreadable=result.get("unreadable") is not False or not bool(content),
                          method="gemini_ocr")
            lines = [line.strip() for line in content.splitlines() if line.strip()]
            record["heading"] = (lines[0] if lines else "")[:240]
    extraction["warnings"] = [warning for warning in extraction["warnings"] if "OCR" not in warning]
    if any(page["unreadable"] and page["method"] != "blank_page" for page in extraction["pages"]):
        extraction["warnings"].append("برخی صفحات پس از OCR نیز خوانا نیستند و نیازمند بررسی هستند.")
    if any(page["method"] == "blank_page" for page in extraction["pages"]):
        extraction["warnings"].append("صفحات خالی فایل بدون ساختن متن حفظ شدند.")
    if any(page["method"] == "gemini_ocr" for page in extraction["pages"]):
        extraction["warnings"].append("متن OCR باید با تصویر صفحه تطبیق داده شود؛ این مرحله تأیید علمی نیست.")
    return extraction


def upload_figures(raw: bytes, extraction: dict[str, Any], job_id: str, capability: str) -> None:
    """Private original objects only; masks are composed losslessly, never by AI."""
    import pymupdf

    total = count = skipped = 0
    prepared = []
    failures = []

    def record_failure(figure: dict[str, Any], error: ProcessingError) -> None:
        code = str(error)
        if code in ("job_api_http_401", "job_api_http_403", "job_api_http_409", "stale_revision"):
            raise error
        # Retain only fixed public codes, never exception bodies or private URLs.
        if not re.fullmatch(r"job_api_http_[0-9]{3}|job_request_failed|job_response_invalid|figure_response_invalid", code):
            code = "figure_upload_failed"
        failures.append({"page": figure["page"], "xref": figure["xref"], "code": code})
        extraction["warnings"].append(f"ذخیرهٔ تصویر صفحه {figure['page']} انجام نشد ({code})؛ متن منبع حفظ شد.")
    with pymupdf.open(stream=raw, filetype="pdf") as document:
        for figure in extraction["figures"]:
            if (min(figure["width"], figure["height"]) < 128 or
                    figure["width"] * figure["height"] > 100_000_000):
                skipped += 1
                continue
            if len(prepared) >= MAX_FIGURES:
                skipped += 1
                continue
            image = document.extract_image(figure["xref"])
            if not image:
                skipped += 1
                continue
            data, extension = image["image"], image.get("ext", "")
            # Soft masks are separate PDF objects: extracting only the base image
            # loses transparency and can hide meaningful labels/backgrounds.
            mask = next((entry[1] for entry in document[figure["page"] - 1].get_images(full=True)
                         if entry[0] == figure["xref"]), 0)
            if mask:
                data = pymupdf.Pixmap(pymupdf.Pixmap(document, figure["xref"]),
                                      pymupdf.Pixmap(document, mask)).tobytes("png")
                extension = "png"
            elif extension not in ("png", "jpeg", "jpg"):
                pixmap = pymupdf.Pixmap(document, figure["xref"])
                if pixmap.n - pixmap.alpha > 3:
                    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pixmap)
                data, extension = pixmap.tobytes("png"), "png"
            if len(data) > MAX_FIGURE_BYTES or total + len(data) > MAX_FIGURE_TOTAL:
                skipped += 1
                continue
            sha = hashlib.sha256(data).hexdigest()
            prepared.append((figure, data, extension, sha))
            total += len(data)
    if prepared:
        try:
            api(job_id, capability, "figure_manifest", pageCount=extraction["pageCount"],
                figures=[{key: figure[key] for key in ("page", "xref", "width", "height")} | {"sha256": sha}
                         for figure, _data, _extension, sha in prepared])
        except ProcessingError as error:
            for figure, _data, _extension, _sha in prepared:
                record_failure(figure, error)
            prepared = []
        for figure, data, extension, sha in prepared:
            try:
                result = api(job_id, capability, "figure_result", page=figure["page"],
                             xref=figure["xref"], width=figure["width"], height=figure["height"],
                             sha256=sha, imageBase64=base64.b64encode(data).decode("ascii"))
                if not isinstance(result.get("figureId"), str):
                    raise ProcessingError("figure_response_invalid")
            except ProcessingError as error:
                record_failure(figure, error)
                continue
            figure.update(storedFigureId=result["figureId"], sha256=sha, extension=extension)
            count += 1
    extraction["storedFigureCount"] = count
    extraction["figureUploadFailures"] = failures[:MAX_FIGURES]
    if skipped:
        extraction["warnings"].append(f"{skipped} تصویر کوچک یا خارج از محدودیت نگهداری نشد؛ فهرست منبع برای بازبینی حفظ شد.")


def api(job_id: str, capability: str, action: str, **extra: Any) -> dict[str, Any]:
    payload = {"jobId": job_id, "capability": capability, "action": action, **extra}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(body) > MAX_RESULT_BYTES:
        raise ProcessingError("job_payload_too_large")
    request = urllib.request.Request(ENDPOINT, data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    # Quota and temporary-service retries are bounded. Uncertain network failures are
    # not automatically retried because a model step may already have completed.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                result = json.loads(response.read(MAX_RESULT_BYTES + 1).decode("utf-8"))
            if not isinstance(result, dict):
                raise ProcessingError("job_response_invalid")
            return result
        except urllib.error.HTTPError as error:
            if error.code in (429, 503) and attempt < 2:
                retry = error.headers.get("Retry-After", "") if error.headers else ""
                wait = min(30, max(1, int(retry))) if retry.isdigit() else 5 * (attempt + 1)
                time.sleep(wait)
                continue
            raise ProcessingError("job_api_http_" + str(error.code)) from None
        except (OSError, ValueError):
            if action in ("figure_result", "figure_manifest") and attempt < 2:
                time.sleep(attempt + 1)
                continue
            raise ProcessingError("job_request_failed") from None
    raise ProcessingError("job_retry_limit")


def process_job(job_id: str, capability: str) -> None:
    result = api(job_id, capability, "claim")
    job = result.get("job")
    if not isinstance(job, dict):
        raise ProcessingError("job_claim_invalid")
    if job.get("kind") == "extract":
        source = job.get("source")
        if not isinstance(source, dict):
            raise ProcessingError("job_source_missing")
        raw = download_source(source)
        extraction = extract_pdf(raw)
        if not job.get("progress", {}).get("validationOnly"):
            upload_figures(raw, extraction, job_id, capability)
        if not job.get("progress", {}).get("figuresOnly"):
            extraction = apply_selective_ocr(raw, extraction, job, job_id, capability)
        api(job_id, capability, "extract_result", extraction=extraction)
    elif job.get("kind") == "generate":
        outputs = job.get("outputs")
        if not isinstance(outputs, list) or not outputs or any(value not in ("lesson", "flashcards", "mcq", "kf") for value in outputs):
            raise ProcessingError("job_outputs_invalid")
        progress = job.get("progress") if isinstance(job.get("progress"), dict) else {}
        completed = progress.get("completedOutputs") or []
        ordered = [value for value in ("lesson", "flashcards", "mcq", "kf") if value in outputs]
        for output in ordered:
            if output not in completed:
                previous = (progress.get("nextChunkIndex") or {}).get(output, 0)
                for _ in range(2000):
                    step = api(job_id, capability, "generate_step", output=output)
                    if step.get("completed") is True:
                        return
                    if step.get("outputComplete") is True:
                        break
                    next_index = step.get("nextChunkIndex")
                    if not isinstance(next_index, int) or next_index <= previous:
                        raise ProcessingError("generation_chunk_not_advancing")
                    previous = next_index
                else:
                    raise ProcessingError("generation_chunk_limit")
    else:
        raise ProcessingError("job_kind_invalid")


def main() -> int:
    job_id = os.environ.get("INTMED_CONTENT_JOB_ID", "")
    capability = os.environ.get("INTMED_CONTENT_JOB_CAPABILITY", "")
    if not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", job_id) or not re.fullmatch(r"[0-9a-f]{64}", capability):
        print("job_environment_invalid", file=sys.stderr)
        return 2
    try:
        process_job(job_id, capability)
        print("Content job completed.")
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, ProcessingError) else "content_processor_failed"
        try:
            api(job_id, capability, "fail", error=code)
        except Exception:
            pass
        print(code, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
