import json
import copy
import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_runner as subject


class PublishedMcqIdentityTest(unittest.TestCase):
    """Saved answers must keep referring to the same question after re-publication."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.topic = self.root / "content/heme/heme-test/data.json"
        self.topic.parent.mkdir(parents=True)
        self.prefix = "review-item-44444444-444-mcq-"
        self.q1 = self.question("bank-q1", "First question", 0)
        self.q2 = self.question("bank-q2", "Second question", 1)
        self.unrelated = {**self.question("bank-q1", "Other import", 2), "id": "unrelated-question"}
        self.topic.write_text(json.dumps({"topicId": "heme-test", "category": "heme", "sources": [],
            "images": [], "lesson": [], "flashcards": [], "kfPmp": [], "mcq": [self.unrelated,
                {**self.q1, "id": self.prefix + "1"}, {**self.q2, "id": self.prefix + "2"}]}), "utf-8")
        self.job = {"draftId": "44444444-4444-4444-8444-444444444444", "title": "Reviewed source",
            "target": {"categoryId": "heme", "topicId": "heme-test", "kind": "lesson"},
            "source": {"kind": "text", "filename": "source.txt"},
            "draft": {"lessonDrafts": [{"heading": "Context", "paragraphs": ["Reviewed context"]}]}}
        root_patch = mock.patch.object(subject, "ROOT", self.root)
        process_patch = mock.patch.object(subject.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="ok"))
        root_patch.start()
        process_patch.start()
        self.addCleanup(root_patch.stop)
        self.addCleanup(process_patch.stop)

    @staticmethod
    def question(source_id, stem, correct_index):
        return {"sourceQuestionId": source_id, "origin": "source", "stem": stem,
            "options": ["A", "B", "C", "D"], "correctIndex": correct_index,
            "explanation": "Reviewed explanation", "optionExplanations": ["One", "Two", "Three", "Four"]}

    def publish(self, questions):
        self.job["draft"]["mcqDrafts"] = copy.deepcopy(questions)
        self.job["draft"]["questionBank"] = {"complete": True,
            "questions": [{"id": row["sourceQuestionId"], "status": "ready"} for row in questions]}
        original_job = copy.deepcopy(self.job)
        subject.integrate_publish_job({}, self.job)
        self.assertEqual(self.job, original_job)
        payload = json.loads(self.topic.read_text("utf-8"))
        self.assertEqual(payload["mcq"][0], self.unrelated)
        return {row["sourceQuestionId"]: row for row in payload["mcq"] if row["id"] != "unrelated-question"}

    def test_reorder_keeps_legacy_ids_and_question_content(self):
        saved = self.publish([self.q2, self.q1])
        self.assertEqual(saved["bank-q1"]["id"], self.prefix + "1")
        self.assertEqual(saved["bank-q2"]["id"], self.prefix + "2")
        for original in [self.q1, self.q2]:
            self.assertEqual({key: saved[original["sourceQuestionId"]][key] for key in original}, original)

    def test_insertion_does_not_reassign_existing_question_ids(self):
        saved = self.publish([self.question("bank-q3", "New question", 3), self.q1, self.q2])
        self.assertEqual(saved["bank-q1"]["id"], self.prefix + "1")
        self.assertEqual(saved["bank-q2"]["id"], self.prefix + "2")
        self.assertNotIn(saved["bank-q3"]["id"], {self.prefix + "1", self.prefix + "2"})

    def test_removed_identity_is_not_recycled_and_returning_question_recovers_id(self):
        self.publish([self.q1])
        saved = self.publish([self.q1, self.question("bank-q3", "New question", 3)])
        new_id = saved["bank-q3"]["id"]
        self.assertNotEqual(new_id, self.prefix + "2")
        saved = self.publish([self.q2, self.q1, self.question("bank-q3", "New question", 3)])
        self.assertEqual(saved["bank-q2"]["id"], self.prefix + "2")
        self.assertEqual(saved["bank-q3"]["id"], new_id)

    def test_duplicate_draft_identity_requires_review_without_writing_content(self):
        before = self.topic.read_bytes()
        with self.assertRaises(subject.RunnerError):
            self.publish([self.q1, {**self.q1, "stem": "Conflicting question"}])
        self.assertEqual(self.topic.read_bytes(), before)

    def test_duplicate_existing_identity_requires_review_without_writing_content(self):
        payload = json.loads(self.topic.read_text("utf-8"))
        payload["mcq"].append({**self.q1, "id": self.prefix + "3"})
        self.topic.write_text(json.dumps(payload), "utf-8")
        before = self.topic.read_bytes()
        with self.assertRaises(subject.RunnerError):
            self.publish([self.q1, self.q2])
        self.assertEqual(self.topic.read_bytes(), before)

    def test_authored_questions_without_source_identity_keep_ids_when_reordered(self):
        payload = json.loads(self.topic.read_text("utf-8"))
        for row in payload["mcq"][1:]:
            del row["sourceQuestionId"]
            row["origin"] = "authored"
        self.topic.write_text(json.dumps(payload), "utf-8")
        self.job["draft"]["mcqDrafts"] = copy.deepcopy(list(reversed(payload["mcq"][1:])))
        subject.integrate_publish_job({}, self.job)
        saved = json.loads(self.topic.read_text("utf-8"))["mcq"]
        self.assertEqual({row["stem"]: row["id"] for row in saved}, {
            "Other import": "unrelated-question", "First question": self.prefix + "1",
            "Second question": self.prefix + "2"})

    def test_ambiguous_question_bank_identity_requires_review_without_writing_content(self):
        self.job["draft"].update({"mcqDrafts": [self.q1], "questionBank": {"complete": True,
            "questions": [{"id": "bank-q1", "status": "ready"}, {"id": "bank-q1", "status": "needs_review"}]}})
        before = self.topic.read_bytes()
        with self.assertRaises(subject.RunnerError):
            subject.integrate_publish_job({}, self.job)
        self.assertEqual(self.topic.read_bytes(), before)

    def test_authored_question_round_trip_preserves_raw_text_and_identity(self):
        payload = json.loads(self.topic.read_text("utf-8"))
        authored = {"id": self.prefix + "1", "origin": "authored",
            "stem": "  تشخیص\n  <b>اصلی</b> چیست؟\u200c ", "options": [" A\n B ", "<i>C</i>", "ی ک", "ي ك"],
            "correctIndex": 2, "explanation": "  توضیح\t\n چندخطی  ",
            "optionExplanations": [" A ", " B\n C ", "<p>متن</p>", "ي\u200cك"]}
        payload["mcq"] = [self.unrelated, authored]
        self.topic.write_text(json.dumps(payload), "utf-8")
        self.job["draft"]["mcqDrafts"] = [{key: value for key, value in authored.items() if key != "id"}]
        original_job = copy.deepcopy(self.job)
        for _ in range(3):
            subject.integrate_publish_job({}, self.job)
            saved = json.loads(self.topic.read_text("utf-8"))["mcq"][1]
            self.assertEqual({key: saved[key] for key in authored}, authored)
        self.assertEqual(self.job, original_job)

    def test_nonnumeric_reserved_suffix_does_not_crash_or_recycle_ids(self):
        payload = json.loads(self.topic.read_text("utf-8"))
        payload["mcq"][2]["id"] = self.prefix + "²"
        self.topic.write_text(json.dumps(payload), "utf-8")
        try:
            self.publish([self.q1])
        except ValueError as exc:
            self.fail("Reserved nondecimal IDs must not enter numeric allocation: " + str(exc))
        saved = self.publish([self.q1, self.q2, self.question("bank-q3", "New question", 3)])
        self.assertEqual(saved["bank-q2"]["id"], self.prefix + "²")
        self.assertNotIn(saved["bank-q3"]["id"], {self.prefix + "1", self.prefix + "²"})


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
        def fetch_taxonomy(url, **kwargs):
            if url != "https://drgerami-md.ir/intmed/content/taxonomy.json":
                raise subject.RunnerError("HTTP 404: application moved to /intmed/")
            return payload
        with mock.patch.object(subject, "request_json", side_effect=fetch_taxonomy):
            self.assertEqual(subject.load_taxonomy(), [{"id": "id-cns", "label": "انسفالیت", "category": "عفونی"}])

    def test_known_local_models_are_recommended(self):
        models = ["gemma-4-e2b", "Qwen3-4B-Thinking-2507", "DeepSeek-R1-Distill-Qwen-7B"]
        result = subject.recommend_models(models)
        self.assertEqual(result["primary_model"], models[0])
        self.assertEqual(result["vision_model"], models[0])
        self.assertEqual(result["style_model"], models[0])
        self.assertEqual(result["review_model"], models[2])

    def test_qwen_instruct_is_preferred_over_gemma_and_thinking(self):
        models = ["qwen/qwen3-4b-thinking-2507", "google/gemma-4-e2b", "qwen/qwen3-4b-instruct-2507"]
        self.assertEqual(subject.recommend_models(models)["primary_model"], models[2])

    def test_existing_thinking_config_uses_non_thinking_local_fallback(self):
        config = {"primary_model": "qwen/qwen3-4b-thinking-2507",
                  "style_model": "google/gemma-4-e2b", "vision_model": "google/gemma-4-e2b"}
        self.assertEqual(subject.drafting_model(config), "google/gemma-4-e2b")

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

    def test_draft_validation_normalizes_small_model_array_shape(self):
        draft = {"suggestedTopicId": None, "confidence": .4, "title": "تصویر", "sourceSummary": "خلاصه",
                 "medicalWarnings": None, "lessonOutline": "یافتهٔ قابل مشاهده", "mcqDrafts": None,
                 "kfDrafts": [], "imageCandidates": {"description": "لام خون"},
                 "sourceEvidence": None, "insufficientEvidence": "تشخیص قطعی از تصویر ممکن نیست"}
        result = subject.validate_draft(draft, set())
        self.assertEqual(result["insufficientEvidence"], ["تشخیص قطعی از تصویر ممکن نیست"])
        self.assertEqual(result["lessonOutline"], ["یافتهٔ قابل مشاهده"])
        self.assertEqual(result["imageCandidates"], [{"description": "لام خون"}])
        self.assertTrue(any("به آرایه تبدیل شد" in warning for warning in result["medicalWarnings"]))

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

    def test_approved_pbs_image_is_routed_to_canonical_gallery(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/heme/heme-iron-anemia/data.json"
            topic.parent.mkdir(parents=True)
            topic.write_text(json.dumps({"topicId": "heme-iron-anemia", "category": "heme",
                "sources": [], "images": [], "lesson": [], "mcq": [], "kfPmp": []}), "utf-8")
            job = {"draftId": "11111111-1111-4111-8111-111111111111", "title": "لام خون محیطی",
                "sourceSummary": "خلاصهٔ مرتبط و بازبینی‌شدهٔ لام خون محیطی برای کتابخانهٔ آموزشی.", "draft": {},
                "target": {"categoryId": "heme", "topicId": "heme-iron-anemia", "topicLabel": "آنمی فقر آهن",
                           "isNew": False, "kind": "pbs", "sourceClass": "authored",
                           "rightsNote": "تصویر تألیفی IntMed و مجاز برای انتشار عمومی"},
                "source": {"kind": "image", "mimeType": "image/png", "filename": "smear.png",
                           "downloadUrl": subject.FALLBACK_SUPABASE_URL + "/storage/v1/object/sign/intmed-content-inbox/x?token=y"}}
            def download(_config, _job, destination):
                destination.write_bytes(b"png")
            completed = mock.MagicMock(returncode=0, stdout="ok")
            with mock.patch.object(subject, "ROOT", root), mock.patch.object(subject, "download_source", side_effect=download), \
                 mock.patch.object(subject.subprocess, "run", return_value=completed):
                subject.integrate_publish_job({"supabase_url": subject.FALLBACK_SUPABASE_URL}, job)
            saved = json.loads(topic.read_text("utf-8"))
            self.assertEqual(saved["images"][0]["kind"], "pbs")
            self.assertEqual(saved["images"][0]["sourceClass"], "authored")
            self.assertEqual(saved["images"][0]["note"], job["sourceSummary"])
            self.assertTrue((topic.parent / saved["images"][0]["assetPath"]).is_file())

    def test_image_without_rights_form_preserves_unknown_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/heme/heme-iron-anemia/data.json"
            topic.parent.mkdir(parents=True)
            topic.write_text(json.dumps({"topicId": "heme-iron-anemia", "category": "heme", "sources": [], "images": []}), "utf-8")
            job = {"draftId": "11111111-1111-4111-8111-111111111111", "title": "تصویر بازبینی‌شده",
                   "sourceSummary": "شرح تصویر و نکات علمی مرتبط با مبحث انتخاب‌شده.", "draft": {},
                   "target": {"categoryId": "heme", "topicId": "heme-iron-anemia", "kind": "image"},
                   "source": {"mimeType": "image/png", "filename": "image.png", "downloadUrl": "https://example.invalid"}}
            with mock.patch.object(subject, "ROOT", root), \
                 mock.patch.object(subject, "download_source", side_effect=lambda _config, _job, destination: destination.write_bytes(b"png")), \
                 mock.patch.object(subject.subprocess, "run", return_value=mock.MagicMock(returncode=0, stdout="ok")):
                subject.integrate_publish_job({}, job)
            saved = json.loads(topic.read_text("utf-8"))
            self.assertNotIn("sourceClass", saved["images"][0])
            self.assertNotIn("sourceClass", saved["sources"][0])
            self.assertEqual(saved["images"][0]["caption"], job["title"])
            self.assertEqual(saved["images"][0]["note"], job["sourceSummary"])

    def test_educational_image_kind_is_preserved_for_topic_and_library(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/endo/endo-diabetes-complications/data.json"
            topic.parent.mkdir(parents=True)
            topic.write_text(json.dumps({"topicId": "endo-diabetes-complications", "category": "endo",
                "sources": [], "images": [], "lesson": [], "mcq": [], "kfPmp": []}), "utf-8")
            summary = "توضیح بازبینی‌شده‌ای که باید زیر تصویر آموزشی در خود فصل و کتابخانه نمایش داده شود."
            job = {"draftId": "22222222-2222-4222-8222-222222222222", "title": "عوارض عروقی دیابت",
                "sourceSummary": summary, "draft": {},
                "target": {"categoryId": "endo", "topicId": "endo-diabetes-complications",
                           "topicLabel": "عوارض دیابت", "isNew": False, "kind": "image",
                           "sourceClass": "authored", "rightsNote": "تصویر تألیفی IntMed"},
                "source": {"kind": "image", "mimeType": "image/png", "filename": "diagram.png",
                           "downloadUrl": subject.FALLBACK_SUPABASE_URL + "/storage/v1/object/sign/intmed-content-inbox/x?token=y"}}
            completed = mock.MagicMock(returncode=0, stdout="ok")
            with mock.patch.object(subject, "ROOT", root), \
                 mock.patch.object(subject, "download_source", side_effect=lambda _c, _j, path: path.write_bytes(b"png")), \
                 mock.patch.object(subject.subprocess, "run", return_value=completed):
                subject.integrate_publish_job({"supabase_url": subject.FALLBACK_SUPABASE_URL}, job)
                subject.integrate_publish_job({"supabase_url": subject.FALLBACK_SUPABASE_URL}, job)
            images = json.loads(topic.read_text("utf-8"))["images"]
            self.assertEqual(len(images), 1)
            image = images[0]
            self.assertEqual(image["kind"], "image")
            self.assertEqual(image["note"], summary)

    def test_online_draft_flashcards_are_published_with_the_lesson(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/id/id-cns-meningoencephalitis/data.json"
            topic.parent.mkdir(parents=True)
            topic.write_text(json.dumps({"topicId": "id-cns-meningoencephalitis", "category": "id",
                "sources": [], "images": [], "flashcards": [], "lesson": [], "mcq": [], "kfPmp": []}), "utf-8")
            job = {"draftId": "33333333-3333-4333-8333-333333333333", "title": "انسفالیت",
                "sourceSummary": "خلاصهٔ آماده و بازبینی‌شده", "draft": {
                    "lessonOutline": ["رویکرد تشخیصی"],
                    "flashcardDrafts": [{"front": "یافتهٔ کلیدی چیست؟", "back": "اختلال پارانشیم", "tags": ["تشخیص"]}],
                    "mcqDrafts": [], "kfDrafts": []},
                "target": {"categoryId": "id", "topicId": "id-cns-meningoencephalitis",
                    "topicLabel": "مننژیت و انسفالیت", "isNew": False, "kind": "lesson",
                    "sourceClass": "", "rightsNote": ""},
                "source": {"kind": "text", "mimeType": "text/plain", "filename": "telegram.txt"}}
            completed = mock.MagicMock(returncode=0, stdout="ok")
            with mock.patch.object(subject, "ROOT", root), mock.patch.object(subject.subprocess, "run", return_value=completed):
                subject.integrate_publish_job({"supabase_url": subject.FALLBACK_SUPABASE_URL}, job)
            saved = json.loads(topic.read_text("utf-8"))
            self.assertEqual(saved["flashcards"][0]["front"], "یافتهٔ کلیدی چیست؟")
            self.assertEqual(saved["flashcards"][0]["sourceRefs"][0]["sourceId"], "review-source-33333333-333")

    def test_rich_lesson_sections_are_published_and_replace_prior_retry(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/id/id-cns-meningoencephalitis/data.json"
            topic.parent.mkdir(parents=True)
            topic.write_text(json.dumps({"topicId": "id-cns-meningoencephalitis", "category": "id",
                "sources": [], "images": [], "flashcards": [], "lesson": [], "mcq": [], "kfPmp": []}), "utf-8")
            job = {"draftId": "44444444-4444-4444-8444-444444444444", "title": "انسفالیت",
                "sourceSummary": "خلاصه", "draft": {"lessonDrafts": [
                    {"heading": "تعریف", "paragraphs": ["درگیری پارانشیم مغز با اختلال عملکرد عصبی تظاهر می‌کند."],
                     "keyPoints": ["آسیکلوویر تجربی را به تأخیر نیندازید"], "sourcePages": [1, 2]},
                    {"heading": "تشخیص", "paragraphs": ["MRI و CSF ارکان بررسی هستند."], "keyPoints": []}],
                    "flashcardDrafts": [], "mcqDrafts": [], "kfDrafts": []},
                "target": {"categoryId": "id", "topicId": "id-cns-meningoencephalitis",
                    "topicLabel": "مننژیت و انسفالیت", "isNew": False, "kind": "lesson",
                    "sourceClass": "", "rightsNote": ""},
                "source": {"kind": "text", "mimeType": "text/plain", "filename": "telegram.txt"}}
            completed = mock.MagicMock(returncode=0, stdout="ok")
            with mock.patch.object(subject, "ROOT", root), mock.patch.object(subject.subprocess, "run", return_value=completed):
                subject.integrate_publish_job({}, job)
                subject.integrate_publish_job({}, job)
            lesson = json.loads(topic.read_text("utf-8"))["lesson"]
            self.assertEqual(len(lesson), 2)
            self.assertEqual(lesson[0]["heading"], "تعریف")
            self.assertIn("نکات کلیدی", lesson[0]["paragraphs"][-1]["text"])
            self.assertEqual(lesson[0]["paragraphs"][0]["sourceRefs"][0]["pages"], [1, 2])
            self.assertEqual(lesson[0]["paragraphs"][0]["legacyLoc"], "lesson:0:0")

    def test_run_once_prioritizes_approved_publish_queue(self):
        with mock.patch.object(subject, "auth_headers", return_value={"Authorization": "Bearer test"}), \
             mock.patch.object(subject, "run_publish_once", return_value=True) as publish, \
             mock.patch.object(subject, "runner_api") as intake:
            self.assertTrue(subject.run_once({"runner_id": "runner", "primary_model": "gemma"}))
        publish.assert_called_once()
        intake.assert_not_called()

    def test_publish_checkout_ignores_only_finder_metadata(self):
        with mock.patch.object(subject, "git_run", side_effect=[
                subject.PUBLISH_BRANCH, "?? .DS_Store\n?? content/cardio/.DS_Store", ""] ) as git:
            subject.ensure_publish_checkout()
        git.assert_called_with("pull", "--ff-only", "origin", subject.PUBLISH_BRANCH)

    def test_publish_checkout_resumes_only_same_topic_changes(self):
        job = {"target": {"categoryId": "endo", "topicId": "endo-diabetes-complications"}}
        with mock.patch.object(subject, "git_run", side_effect=[subject.PUBLISH_BRANCH,
                " M content/endo/endo-diabetes-complications/data.json\n"
                "?? content/endo/endo-diabetes-complications/assets/review.png"] ) as git:
            subject.ensure_publish_checkout(job)
        self.assertEqual(git.call_count, 2)

    def test_publish_checkout_rejects_real_untracked_content(self):
        with mock.patch.object(subject, "git_run", side_effect=[
                subject.PUBLISH_BRANCH, "?? .DS_Store\n?? content/new-topic/data.json"]):
            with self.assertRaisesRegex(subject.RunnerError, "تغییرات ثبت‌نشده"):
                subject.ensure_publish_checkout()

    def test_publish_materializes_existing_taxonomy_placeholder(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/endo/endo-diabetes-complications/data.json"
            job = {"draftId": "33333333-3333-4333-8333-333333333333",
                "title": "عوارض عروقی دیابت", "sourceSummary": "خلاصهٔ بازبینی‌شده و معتبر برای آغاز مبحث عوارض دیابت و ثبت محتوای آموزشی آن.",
                "draft": {"lessonOutline": ["مرور ساختاریافتهٔ عوارض عروقی دیابت"]},
                "target": {"categoryId": "endo", "topicId": "endo-diabetes-complications",
                           "topicLabel": "عوارض دیابت", "isNew": False, "kind": "lesson",
                           "sourceClass": "", "rightsNote": ""},
                "source": {"kind": "text", "filename": "telegram.txt"}}
            completed = mock.MagicMock(returncode=0, stdout="ok")
            with mock.patch.object(subject, "ROOT", root), \
                 mock.patch.object(subject.subprocess, "run", return_value=completed):
                subject.integrate_publish_job({}, job)
            saved = json.loads(topic.read_text("utf-8"))
            self.assertEqual(saved["topicId"], "endo-diabetes-complications")
            self.assertEqual(saved["category"], "endo")
            self.assertEqual(saved["lesson"][0]["heading"], "عوارض عروقی دیابت")

    def test_private_harrison_image_cannot_enter_public_bundle(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            topic = root / "content/heme/heme-iron-anemia/data.json"
            topic.parent.mkdir(parents=True)
            topic.write_text(json.dumps({"topicId": "heme-iron-anemia", "category": "heme", "sources": [], "images": []}), "utf-8")
            job = {"draftId": "11111111-1111-4111-8111-111111111111", "title": "PBS", "draft": {},
                "target": {"categoryId": "heme", "topicId": "heme-iron-anemia", "topicLabel": "آنمی",
                           "kind": "pbs", "sourceClass": "harrison-private", "rightsNote": "Harrison private"},
                "source": {"mimeType": "image/png", "downloadUrl": "https://example.invalid"}}
            with mock.patch.object(subject, "ROOT", root), self.assertRaisesRegex(subject.RunnerError, "هاریسون"):
                subject.integrate_publish_job({}, job)


if __name__ == "__main__":
    unittest.main()
