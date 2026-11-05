"""Question-bank publication must not turn an outline into a fabricated lesson."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import local_runner as subject


class QuestionPublicationTest(unittest.TestCase):
    def test_mcq_only_source_bank_does_not_publish_summary_as_lesson(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "content/id/id-cns/data.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"topicId": "id-cns", "category": "id", "sources": [],
                "images": [], "lesson": [], "mcq": [], "flashcards": [], "kfPmp": []}), "utf-8")
            job = {"draftId": "11111111-1111-4111-8111-111111111111", "title": "بانک سؤال",
                "sourceSummary": "این متن خلاصه است و درسنامهٔ آماده نیست.",
                "draft": {"questionBank": {"mode": "question_bank", "complete": True,
                    "questions": [{"id": "q1", "status": "ready"}]}, "lessonOutline": ["این هم فقط تیتر است."],
                    "mcqDrafts": [{"sourceQuestionId": "q1", "origin": "source", "stem": "بررسی مناسب چیست؟",
                        "options": ["MRI", "ECG", "CT", "EEG"], "correctIndex": 0,
                        "explanation": "پاسخ ثبت‌شدهٔ منبع MRI است.", "sourcePages": [1, 8]}]},
                "target": {"categoryId": "id", "topicId": "id-cns", "topicLabel": "عفونت عصبی", "kind": "lesson"},
                "source": {"kind": "text", "filename": "authored.txt"}}
            with mock.patch.object(subject, "ROOT", root), mock.patch.object(subject.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="ok")):
                subject.integrate_publish_job({}, job)
            result = json.loads(path.read_text("utf-8"))
            self.assertEqual(result["lesson"], [])
            self.assertEqual(result["mcq"][0]["options"], ["MRI", "ECG", "CT", "EEG"])
            self.assertEqual(result["mcq"][0]["sourceRefs"][0]["pages"], [1, 8])
            self.assertEqual(result["mcq"][0].get("origin"), "source")
            self.assertEqual(result["mcq"][0].get("sourceQuestionId"), "q1")
            job["draft"]["questionBank"]["questions"][0]["status"] = "needs_review"
            with mock.patch.object(subject, "ROOT", root), mock.patch.object(subject.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="ok")):
                with self.assertRaises(subject.RunnerError):
                    subject.integrate_publish_job({}, job)
            self.assertEqual(json.loads(path.read_text("utf-8")), result, "a blocked retry must not replace the previously published package")


if __name__ == "__main__":
    unittest.main()
