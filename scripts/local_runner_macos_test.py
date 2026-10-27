import ast
import plistlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local_runner_macos as subject


class MacRunnerSetupTest(unittest.TestCase):
    def test_plist_runs_only_repo_helper_and_has_safe_restart(self):
        value = subject.plist_payload()
        self.assertEqual(value["Label"], subject.LABEL)
        self.assertEqual(value["ProgramArguments"][-1], "service-watch")
        self.assertEqual(value["KeepAlive"], {"SuccessfulExit": False})
        self.assertNotIn("service_role", str(value).casefold())
        with tempfile.NamedTemporaryFile() as handle:
            plistlib.dump(value, handle)

    def test_server_probe_is_loopback_only(self):
        self.assertEqual(subject.MODELS_URL, "http://127.0.0.1:1234/v1/models")

    def test_lms_fallback_is_inside_user_lmstudio_directory(self):
        with mock.patch.object(subject.shutil, "which", return_value=None), \
             mock.patch.object(subject.Path, "is_file", return_value=True):
            self.assertTrue(subject.lms_path().endswith("/.lmstudio/bin/lms"))

    def test_runner_sources_parse_as_python_39(self):
        for name in ("local_runner.py", "local_runner_macos.py"):
            source = (Path(__file__).resolve().parent / name).read_text("utf-8")
            ast.parse(source, filename=name, feature_version=(3, 9))


if __name__ == "__main__":
    unittest.main()
