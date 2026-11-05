import hashlib
import base64
import io
import json
from pathlib import Path
import sys
import unittest
from unittest import mock
import urllib.error

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import process_content_job as subject


class NativeContentProcessorTest(unittest.TestCase):
    def test_one_figure_failure_preserves_native_text_and_next_figure(self):
        with pymupdf.open() as document:
            page = document.new_page()
            page.insert_text((30, 30), "Native diagnostic evidence must survive an image storage failure.")
            for index in range(2):
                pixmap = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 150, 150), False)
                pixmap.clear_with(80 + index)
                page.insert_image(pymupdf.Rect(30 + index * 170, 50, 180 + index * 170, 200), stream=pixmap.tobytes("png"))
            raw = document.tobytes()
        for failure in ("job_api_http_400", "job_api_http_503", "job_request_failed"):
            with self.subTest(failure=failure), mock.patch.object(subject, "download_source", return_value=raw), \
                 mock.patch.object(subject, "api", side_effect=[{"job": {"kind": "extract", "source": {}}},
                     {"ok": True}, subject.ProcessingError(failure), {"figureId": "second"}, {"ok": True}]) as api:
                subject.process_job("job", "cap")
                self.assertEqual(api.call_args.args[2], "extract_result")
                extraction = api.call_args.kwargs["extraction"]
                self.assertIn("must survive", extraction["pages"][0]["text"])
                self.assertEqual(extraction["storedFigureCount"], 1)
                self.assertEqual(extraction["figureUploadFailures"], [{"page": 1, "xref": extraction["figures"][0]["xref"], "code": failure}])
        for failure in ("job_api_http_403", "job_api_http_409"):
            with self.subTest(failure=failure), mock.patch.object(subject, "api", side_effect=[{"ok": True}, subject.ProcessingError(failure)]):
                with self.assertRaisesRegex(subject.ProcessingError, failure):
                    subject.upload_figures(raw, subject.extract_pdf(raw), "job", "cap")

    def test_private_figure_upload_preserves_original_and_skips_icons(self):
        with pymupdf.open() as document:
            page = document.new_page()
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 180, 140), False)
            pixmap.clear_with(110)
            original = pixmap.tobytes("png")
            page.insert_image(pymupdf.Rect(20, 20, 200, 160), stream=original)
            raw = document.tobytes()
        extraction = subject.extract_pdf(raw)
        with mock.patch.object(subject, "api", return_value={"figureId": "private-id"}) as api:
            subject.upload_figures(raw, extraction, "job", "cap")
        self.assertEqual(api.call_args.args[2], "figure_result")
        self.assertEqual(api.call_args_list[0].args[2], "figure_manifest")
        self.assertEqual(api.call_args_list[0].kwargs["figures"][0]["sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(base64.b64decode(api.call_args.kwargs["imageBase64"]), original)
        self.assertEqual(extraction["figures"][0]["storedFigureId"], "private-id")
        self.assertNotIn("imageBase64", json.dumps(extraction))
        with mock.patch.object(subject, "api") as api:
            subject.upload_figures(self.make_pdf(), subject.extract_pdf(self.make_pdf()), "job", "cap")
        api.assert_not_called()

    def test_soft_mask_is_composed_and_upload_limits_report_skips(self):
        with pymupdf.open() as document:
            page = document.new_page()
            rgb = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 180, 140), False)
            rgb.clear_with(110)
            rgba = pymupdf.Pixmap(rgb, 1)
            rgba.set_alpha(bytes([120]) * (180 * 140))
            page.insert_image(pymupdf.Rect(20, 20, 200, 160), stream=rgba.tobytes("png"))
            raw = document.tobytes()
        extraction = subject.extract_pdf(raw)
        with mock.patch.object(subject, "api", return_value={"figureId": "private-id"}) as api:
            subject.upload_figures(raw, extraction, "job", "cap")
        composed = pymupdf.Pixmap(base64.b64decode(api.call_args.kwargs["imageBase64"]))
        self.assertEqual(composed.alpha, 1)
        self.assertEqual(composed.pixel(0, 0)[-1], 120)
        self.assertEqual(extraction["storedFigureCount"], 1)
        extraction = subject.extract_pdf(raw)
        with mock.patch.object(subject, "MAX_FIGURE_TOTAL", 1), mock.patch.object(subject, "api") as api:
            subject.upload_figures(raw, extraction, "job", "cap")
        api.assert_not_called()
        self.assertEqual(extraction["storedFigureCount"], 0)
        self.assertTrue(any("محدودیت" in warning for warning in extraction["warnings"]))

    def test_figure_network_retries_are_safe_and_bounded(self):
        result = mock.MagicMock()
        result.__enter__.return_value.read.return_value = b'{"figureId":"private-id"}'
        with mock.patch.object(subject.urllib.request, "urlopen", side_effect=[OSError("private URL"), result]) as opened, \
             mock.patch.object(subject.time, "sleep"):
            self.assertEqual(subject.api("id", "cap", "figure_result")["figureId"], "private-id")
        self.assertEqual(opened.call_count, 2)
        with mock.patch.object(subject.urllib.request, "urlopen", side_effect=OSError("private URL")), \
             mock.patch.object(subject.time, "sleep"):
            with self.assertRaisesRegex(subject.ProcessingError, "job_request_failed"):
                subject.api("id", "cap", "figure_result")

    def make_pdf(self):
        with pymupdf.open() as document:
            page = document.new_page()
            page.insert_text((40, 40), "Clinical test heading\nSecond line contains diagnostic source evidence.")
            document.new_page()
            page = document.new_page()
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 40, 40), False)
            pixmap.clear_with(120)
            page.insert_image(pymupdf.Rect(40, 40, 80, 80), stream=pixmap.tobytes("png"))
            return document.tobytes()

    def test_counts_real_pages_extracts_native_text_and_inventory(self):
        extraction = subject.extract_pdf(self.make_pdf())
        self.assertEqual(extraction["pageCount"], 3)
        self.assertEqual([page["page"] for page in extraction["pages"]], [1, 2, 3])
        self.assertIn("heading\nSecond line", extraction["pages"][0]["text"])
        self.assertFalse(extraction["pages"][0]["unreadable"])
        self.assertEqual(extraction["pages"][0]["method"], "native_text")
        self.assertFalse(extraction["pages"][1]["unreadable"])
        self.assertEqual(extraction["pages"][1]["method"], "blank_page")
        self.assertEqual(extraction["pages"][2]["method"], "needs_ocr")
        image = extraction["figures"][0]
        self.assertEqual(image["page"], 3)
        self.assertEqual(image["width"], 40)
        self.assertRegex(image["sha256"], r"^[0-9a-f]{64}$")
        self.assertNotIn("image", image)
        self.assertNotIn("base64", json.dumps(extraction))

    def test_rtl_prefers_creator_sequence_without_reversing_doses(self):
        logical = "1- خانم با سابقه مصرف دارو مراجعه می‌کند.\nDose 10 mg/kg every 8 hours; Hb=7.5"
        visual = "میکند مراجعه دارو مصرف سابقه با خانم -1\nhours 8 every mg/kg 10 Dose; Hb=7.5"
        page = mock.MagicMock()
        page.get_text.side_effect = lambda _kind, sort: visual if sort else logical
        page.get_images.return_value = []
        document = mock.MagicMock()
        document.__enter__.return_value = document
        document.needs_pass = False
        document.page_count = 1
        document.load_page.return_value = page
        with mock.patch.object(pymupdf, "open", return_value=document):
            result = subject.extract_pdf(b"synthetic")
        self.assertEqual(result["pages"][0]["text"], logical)
        self.assertIn("10 mg/kg every 8 hours; Hb=7.5", result["pages"][0]["text"])
        page.get_text.assert_called_once_with("text", sort=False)
        self.assertTrue(any("ترتیب" in warning for warning in result["warnings"]))

    def test_invalid_and_encrypted_pdf_fail_explicitly(self):
        with self.assertRaisesRegex(subject.ProcessingError, "pdf_invalid"):
            subject.extract_pdf(b"not a PDF")
        with pymupdf.open(stream=self.make_pdf(), filetype="pdf") as document:
            encrypted = document.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,
                                         user_pw="test-password", owner_pw="owner-password")
        with self.assertRaisesRegex(subject.ProcessingError, "pdf_password_required"):
            subject.extract_pdf(encrypted)

    def test_rejects_foreign_and_traversal_download_urls(self):
        base = "https://" + subject.SOURCE_HOST
        valid = base + "/storage/v1/object/sign/intmed-content-inbox/source.pdf?token=test"
        self.assertEqual(subject.validate_source_url(valid), valid)
        for url in [valid.replace(subject.SOURCE_HOST, "example.test"),
                    valid.replace("https:", "http:"),
                    valid.replace("source.pdf", "%2e%2e/source.pdf"),
                    valid.replace("intmed-content-inbox", "another-bucket"),
                    valid.split("?")[0], valid + "#fragment"]:
            with self.subTest(url=url), self.assertRaises(subject.ProcessingError):
                subject.validate_source_url(url)

    def test_source_download_verifies_hash_and_limits_size(self):
        raw = self.make_pdf()
        url = "https://" + subject.SOURCE_HOST + "/storage/v1/object/sign/intmed-content-inbox/a.pdf?token=test"
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = raw
        response.__enter__.return_value.geturl.return_value = url
        source = {"downloadUrl": url, "mimeType": "application/pdf", "sha256": hashlib.sha256(raw).hexdigest()}
        with mock.patch.object(subject.urllib.request, "build_opener") as builder:
            builder.return_value.open.return_value = response
            self.assertEqual(subject.download_source(source), raw)
            with self.assertRaisesRegex(subject.ProcessingError, "source_hash_mismatch"):
                subject.download_source({**source, "sha256": "0" * 64})
            response.__enter__.return_value.read.return_value = b"x" * (subject.MAX_SOURCE_BYTES + 1)
            with self.assertRaisesRegex(subject.ProcessingError, "source_size_invalid"):
                subject.download_source(source)

    def test_redirects_are_never_followed(self):
        with self.assertRaisesRegex(subject.ProcessingError, "source_redirect_blocked"):
            subject.NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://elsewhere.test")

    def test_quota_retries_bounded_and_does_not_log_private_detail(self):
        denied = urllib.error.HTTPError(subject.ENDPOINT, 429, "limit", {"Retry-After": "100"}, io.BytesIO(b"secret detail"))
        result = mock.MagicMock()
        result.__enter__.return_value.read.return_value = b'{"ok":true}'
        with mock.patch.object(subject.urllib.request, "urlopen", side_effect=[denied, result]) as opened, \
             mock.patch.object(subject.time, "sleep") as sleep:
            self.assertTrue(subject.api("id", "cap", "generate_step", output="lesson")["ok"])
            self.assertEqual(opened.call_count, 2)
            sleep.assert_called_once_with(30)
        with mock.patch.object(subject.urllib.request, "urlopen", side_effect=denied) as opened, \
             mock.patch.object(subject.time, "sleep"):
            with self.assertRaisesRegex(subject.ProcessingError, "job_api_http_429") as error:
                subject.api("id", "cap", "generate_step", output="lesson")
            self.assertEqual(opened.call_count, 3)
            self.assertNotIn("secret", str(error.exception))

    def test_generation_resumes_only_unfinished_outputs_in_order(self):
        job = {"kind": "generate", "outputs": ["mcq", "lesson", "flashcards"],
               "progress": {"completedOutputs": ["source_questions", "lesson"]}}
        with mock.patch.object(subject, "api", side_effect=[{"job": job}, {"ok": True, "outputComplete": True}, {"ok": True, "completed": True}]) as api:
            subject.process_job("id", "cap")
        self.assertEqual([call.args[2] for call in api.call_args_list], ["claim", "generate_step", "generate_step"])
        self.assertEqual([call.kwargs["output"] for call in api.call_args_list[1:]], ["flashcards", "mcq"])

    def test_source_question_preparation_precedes_requested_outputs(self):
        job = {"kind": "generate", "outputs": ["lesson"], "progress": {}}
        with mock.patch.object(subject, "api", side_effect=[{"job": job},
                {"outputComplete": True, "completed": False},
                {"outputComplete": True, "completed": True}]) as api:
            subject.process_job("id", "cap")
        self.assertEqual([call.kwargs["output"] for call in api.call_args_list[1:]],
                         ["source_questions", "lesson"])

    def test_new_source_evidence_rebuilds_previously_completed_lesson(self):
        job = {"kind": "generate", "outputs": ["lesson", "mcq"],
               "progress": {"completedOutputs": ["lesson"]}}
        with mock.patch.object(subject, "api", side_effect=[{"job": job},
                {"outputComplete": True, "completed": False,
                 "progress": {"completedOutputs": ["source_questions"]}},
                {"outputComplete": True, "completed": False,
                 "progress": {"completedOutputs": ["source_questions", "lesson"]}},
                {"outputComplete": True, "completed": True}]) as api:
            subject.process_job("id", "cap")
        self.assertEqual([call.kwargs["output"] for call in api.call_args_list[1:]],
                         ["source_questions", "lesson", "mcq"])

    def test_extract_job_sends_extraction_only_to_private_bridge(self):
        job = {"kind": "extract", "source": {"downloadUrl": "private"}}
        with mock.patch.object(subject, "api", side_effect=[{"job": job}, {"page": 3, "text": "OCR recovered diagnostic information", "unreadable": False}, {"ok": True}]) as api, \
             mock.patch.object(subject, "download_source", return_value=self.make_pdf()):
            subject.process_job("id", "cap")
        self.assertEqual(api.call_args.args[2], "extract_result")
        self.assertEqual(api.call_args.kwargs["extraction"]["pageCount"], 3)

    def test_figures_only_backfill_never_calls_ocr(self):
        job = {"kind": "extract", "source": {}, "progress": {"figuresOnly": True}}
        with mock.patch.object(subject, "api", side_effect=[{"job": job}, {"ok": True}]) as api, \
             mock.patch.object(subject, "download_source", return_value=self.make_pdf()), \
             mock.patch.object(subject, "apply_selective_ocr") as ocr:
            subject.process_job("id", "cap")
        ocr.assert_not_called()
        self.assertEqual([call.args[2] for call in api.call_args_list], ["claim", "extract_result"])

    def test_selective_ocr_only_sends_image_page_and_reuses_cached_pages(self):
        raw = self.make_pdf()
        native = subject.extract_pdf(raw)
        with mock.patch.object(subject, "api", return_value={"page": 3, "text": "Recovered scan content", "unreadable": False}) as api:
            result = subject.apply_selective_ocr(raw, native, {}, "id", "cap")
        api.assert_called_once()
        self.assertEqual(api.call_args.args[2], "ocr_page")
        self.assertEqual(api.call_args.kwargs["page"], 3)
        image = base64.b64decode(api.call_args.kwargs["imageBase64"])
        self.assertLessEqual(len(image), 2 * 1024 * 1024)
        with pymupdf.open(stream=image, filetype="png") as document:
            self.assertLessEqual(max(document[0].rect.width, document[0].rect.height), 1601)
        self.assertEqual(result["pages"][0]["method"], "native_text")
        self.assertEqual(result["pages"][1]["text"], "")
        self.assertEqual(result["pages"][2]["method"], "gemini_ocr")
        with mock.patch.object(subject, "api") as api:
            result = subject.apply_selective_ocr(raw, subject.extract_pdf(raw),
                {"progress": {"ocrPages": {"3": {"page": 3, "text": "Cached scan content", "unreadable": False}}}}, "id", "cap")
        api.assert_not_called()
        self.assertEqual(result["pages"][2]["text"], "Cached scan content")

    def test_generation_chunk_loop_resumes_until_output_complete(self):
        job = {"kind": "generate", "outputs": ["lesson"], "progress": {"completedOutputs": ["source_questions"], "nextChunkIndex": {"lesson": 2}}}
        with mock.patch.object(subject, "api", side_effect=[{"job": job},
                {"outputComplete": False, "nextChunkIndex": 3}, {"outputComplete": True, "completed": True}]) as api:
            subject.process_job("id", "cap")
        self.assertEqual(api.call_count, 3)
        with mock.patch.object(subject, "api", side_effect=[{"job": job},
                {"outputComplete": False, "nextChunkIndex": 2}]):
            with self.assertRaisesRegex(subject.ProcessingError, "generation_chunk_not_advancing"):
                subject.process_job("id", "cap")


if __name__ == "__main__":
    unittest.main()
