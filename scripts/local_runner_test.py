import json
import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_runner as subject


class LocalRunnerTest(unittest.TestCase):
    def test_only_loopback_lm_studio_is_allowed(self):
        self.assertEqual(subject.validate_lm_url("http://127.0.0.1:1234"), "http://127.0.0.1:1234/v1")
        with self.assertRaises(subject.RunnerError):
            subject.validate_lm_url("http://192.168.1.10:1234/v1")

    def test_supabase_host_is_restricted(self):
        self.assertEqual(subject.validate_supabase_url("https://abc.supabase.co/"), "https://abc.supabase.co")
        self.assertEqual(subject.validate_supabase_url("https://api.drgerami-md.ir"), "https://api.drgerami-md.ir")
        with self.assertRaises(subject.RunnerError):
            subject.validate_supabase_url("https://example.com")

    def test_gateway_403_and_network_failures_allow_fixed_project_fallback(self):
        self.assertTrue(subject.retryable_gateway_error(subject.RunnerError("HTTP 403: request failed")))
        self.assertTrue(subject.retryable_gateway_error(subject.RunnerError("اتصال برقرار نشد: timeout")))
        self.assertFalse(subject.retryable_gateway_error(subject.RunnerError("HTTP 400: Invalid login credentials")))

    def test_remote_requests_identify_the_site_origin(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"ok":true}'
        with mock.patch.object(subject.urllib.request, "urlopen", return_value=response) as opened:
            subject.request_json("https://api.drgerami-md.ir/auth/v1/health")
        request = opened.call_args.args[0]
        self.assertEqual(request.get_header("Origin"), subject.SITE_ORIGIN)
        self.assertEqual(request.get_header("User-agent"), "IntMedLocalRunner/1.1")

    def test_signed_download_retries_fixed_supabase_after_gateway_403(self):
        denied = subject.urllib.error.HTTPError("https://api.drgerami-md.ir/file", 403, "Forbidden", {}, io.BytesIO())
        response = mock.MagicMock()
        response.__enter__.return_value.read.side_effect = [b"image-bytes", b""]
        job = {"downloadUrl": subject.FALLBACK_SUPABASE_URL +
               "/storage/v1/object/sign/intmed-content-inbox/private/image.jpg?token=signed",
               "sha256": hashlib.sha256(b"image-bytes").hexdigest()}
        with tempfile.TemporaryDirectory() as folder, \
             mock.patch.object(subject.urllib.request, "urlopen", side_effect=[denied, response]) as opened:
            destination = Path(folder) / "image.jpg"
            subject.download_source({"supabase_url": "https://api.drgerami-md.ir"}, job, destination)
            self.assertEqual(destination.read_bytes(), b"image-bytes")
        self.assertEqual(opened.call_count, 2)
        first, second = (call.args[0] for call in opened.call_args_list)
        self.assertEqual(first.host, "api.drgerami-md.ir")
        self.assertEqual(second.host, "upwbktvnybsjugdegjji.supabase.co")
        self.assertEqual(first.get_header("Origin"), subject.SITE_ORIGIN)

    def test_taxonomy_is_flattened(self):
        payload = {"categories": [{"label": "عفونی", "topics": [{"id": "id-cns", "label": "انسفالیت"}]}]}
        with mock.patch.object(subject, "request_json", return_value=payload):
            self.assertEqual(subject.load_taxonomy(), [{"id": "id-cns", "label": "انسفالیت", "category": "عفونی"}])

    def test_known_local_models_are_recommended(self):
        models = ["gemma-4-e2b", "Qwen3-4B-Thinking-2507", "DeepSeek-R1-Distill-Qwen-7B"]
        result = subject.recommend_models(models)
        self.assertEqual(result["primary_model"], models[1])
        self.assertEqual(result["vision_model"], models[0])
        self.assertEqual(result["style_model"], models[0])
        self.assertEqual(result["review_model"], models[2])

    def test_json_parser_strips_thinking_and_fence(self):
        value = subject.extract_json('<think>private reasoning</think>\n```json\n{"ok":true}\n```')
        self.assertEqual(value, {"ok": True})

    def test_lm_chat_enforces_json_and_recovers_qwen_reasoning_field(self):
        response = {"choices": [{"finish_reason": "stop", "message": {
            "content": "", "reasoning_content": '<think>hidden</think> {"ok":true}'}}]}
        with mock.patch.object(subject, "request_json", return_value=response) as requested:
            value = subject.lm_chat({"lmstudio_url": "http://127.0.0.1:1234/v1"}, "qwen", [],
                                    temperature=0.1, max_tokens=200)
        self.assertEqual(json.loads(value), {"ok": True})
        payload = requested.call_args.kwargs["body"]
        self.assertEqual(payload["response_format"]["type"], "json_schema")
        self.assertFalse(payload["chat_template_kwargs"]["enable_thinking"])

    def test_lm_json_does_not_run_valid_request_twice(self):
        with mock.patch.object(subject, "lm_chat", return_value='{"ok":true}') as chat:
            self.assertEqual(subject.lm_json({}, "qwen", "system", "user"), {"ok": True})
        self.assertEqual(chat.call_count, 1)

    def test_page_chunks_preserve_page_markers(self):
        chunks = subject.page_chunks(["الف" * 60, "ب" * 60], limit=90)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertIn("[PAGE 1]", chunks[0])
        self.assertTrue(any("[PAGE 2]" in chunk for chunk in chunks))

    def test_draft_validation_enforces_taxonomy_and_review_state(self):
        draft = {"suggestedTopicId": "not-allowed", "confidence": 5, "title": "عنوان",
                 "sourceSummary": "خلاصه", "medicalWarnings": [], "lessonOutline": [],
                 "mcqDrafts": [{"stem": "؟", "options": ["۱", "۲", "۳", "۴"], "correctIndex": 0, "explanation": ""}],
                 "kfDrafts": [{"prompt": "؟", "expectedAnswer": "پاسخ"}], "imageCandidates": [],
                 "sourceEvidence": [], "insufficientEvidence": []}
        result = subject.validate_draft(draft, {"id-cns"})
        self.assertIsNone(result["suggestedTopicId"])
        self.assertEqual(result["confidence"], 1)
        self.assertEqual(result["mcqDrafts"][0]["reviewStatus"], "draft")
        self.assertEqual(result["kfDrafts"][0]["reviewStatus"], "draft")

    def test_taxonomy_candidates_keep_relevant_persian_topic_and_limit_context(self):
        rows = [{"id": f"topic-{index}", "label": f"مبحث {index}", "category": "سایر"} for index in range(100)]
        rows.append({"id": "id-cns", "label": "انسفالیت و مننژیت", "category": "عفونی"})
        result = subject.taxonomy_candidates(rows, "لطفاً فصل انسفالیت را در عفونی بساز", limit=20)
        self.assertEqual(result[0]["id"], "id-cns")
        self.assertLessEqual(len(result), 20)

    def test_config_has_owner_only_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config.json"
            subject.save_config(path, {"ok": True})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_bundled_publishable_key_is_read_from_site_config(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config.js"
            path.write_text('window.INTMED_CONFIG={"supabaseAnonKey":"public-test-key"};', "utf-8")
            self.assertEqual(subject.bundled_publishable_key(path), "public-test-key")

    def test_style_pass_rejects_changed_numbers(self):
        draft = {"title": "دوز 10", "sourceSummary": "هر 8 ساعت", "lessonOutline": ["روز 3"],
                 "medicalWarnings": []}
        with mock.patch.object(subject, "lm_json", return_value={"title": "دوز 20", "sourceSummary": "هر 8 ساعت", "lessonOutline": ["روز 3"]}):
            config = {"style_model": "gemma"}
            result = subject.humanize(config, draft)
        self.assertEqual(result["title"], "دوز 10")
        self.assertTrue(any("پذیرفته نشد" in item for item in result["medicalWarnings"]))

    def test_style_pass_also_protects_persian_numbers(self):
        draft = {"title": "دوز ۱۰", "sourceSummary": "هر ۸ ساعت", "lessonOutline": ["روز ۳"],
                 "medicalWarnings": []}
        changed = {"title": "دوز ۲۰", "sourceSummary": "هر ۸ ساعت", "lessonOutline": ["روز ۳"]}
        with mock.patch.object(subject, "lm_json", return_value=changed):
            result = subject.humanize({"style_model": "gemma"}, draft)
        self.assertEqual(result["title"], "دوز ۱۰")


if __name__ == "__main__":
    unittest.main()
