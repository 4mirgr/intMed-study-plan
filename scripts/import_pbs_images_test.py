"""Offline behavioral checks for the curated PBS importer (no network calls)."""
import importlib.util
from contextlib import contextmanager
from email.message import Message
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error

from PIL import Image


SCRIPT = Path(__file__).with_name('import_pbs_images.py')
SPEC = importlib.util.spec_from_file_location('pbs_importer', SCRIPT)


class ImportPBSTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), 'Curated PBS importer is not implemented')
        self.mod = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(self.mod)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.topic = self.root / 'content/heme/heme-test'
        self.topic.mkdir(parents=True)
        self.data = self.topic / 'data.json'
        self.original = {'category': 'heme', 'topicId': 'heme-test', 'lesson': [{'id': 'kept'}]}
        self.data.write_text(json.dumps(self.original))
        output = io.BytesIO()
        Image.new('RGB', (800, 600), 'pink').save(output, format='JPEG')
        self.jpeg = output.getvalue()
        self.entry = {
            'id': 'pbs-test', 'topicId': 'heme-test', 'category': 'heme',
            'fileName': 'Example.jpg', 'imageUrl': 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg',
            'sourcePage': 'https://commons.wikimedia.org/wiki/File:Example.jpg',
            'creator': 'Example Author', 'license': 'CC BY 2.0',
            'licenseUrl': 'https://creativecommons.org/licenses/by/2.0/',
            'width': 800, 'height': 600, 'caption': 'شرح فارسی', 'note': 'محدودیت تشخیصی',
            'visualApproved': False, 'reviewStatus': 'draft',
        }

    @contextmanager
    def network(self, replies):
        """Replace only external requests and wall-clock waiting, keeping download real."""
        elapsed = [0]
        request_times = []
        replies = iter(replies)

        def sleep(seconds):
            elapsed[0] += seconds

        def open_request(request, timeout):
            self.assertEqual(request.full_url, self.entry['imageUrl'])
            request_times.append(elapsed[0])
            reply = next(replies)
            if isinstance(reply, Exception):
                raise reply
            response = io.BytesIO(reply)
            response.status = 200
            response.headers = Message()
            response.headers['Content-Type'] = 'image/jpeg'
            return response

        clock = SimpleNamespace(time=lambda: elapsed[0], sleep=sleep)
        with patch.object(self.mod, 'time', clock, create=True), patch.object(
                self.mod.urllib.request, 'build_opener', return_value=SimpleNamespace(open=open_request)):
            yield request_times

    def http_error(self, status, retry_after=None):
        headers = Message()
        if retry_after is not None:
            headers['Retry-After'] = retry_after
        return urllib.error.HTTPError(self.entry['imageUrl'], status,
                                      'server detail must not reach diagnostics', headers, io.BytesIO())

    def test_rate_limit_retries_original_request_after_integer_cooldown(self):
        with self.network([self.http_error(429, '4'), self.jpeg]) as requests:
            self.assertEqual(self.mod.download(self.entry['imageUrl']), self.jpeg)
        self.assertEqual(len(requests), 2)
        self.assertGreaterEqual(requests[0], 1)
        self.assertGreaterEqual(requests[1] - requests[0], 4)

    def test_rate_limit_respects_http_date_cooldown(self):
        with self.network([self.http_error(429, 'Thu, 01 Jan 1970 00:00:07 GMT'), self.jpeg]) as requests:
            self.assertEqual(self.mod.download(self.entry['imageUrl']), self.jpeg)
        self.assertEqual(len(requests), 2)
        self.assertGreaterEqual(requests[1], 7)

    def test_missing_invalid_and_past_retry_after_still_pace_retry(self):
        for retry_after in [None, 'invalid', 'Thu, 01 Jan 1970 00:00:00 GMT']:
            with self.subTest(retry_after=retry_after), self.network([
                    self.http_error(429, retry_after), self.jpeg]) as requests:
                self.assertEqual(self.mod.download(self.entry['imageUrl']), self.jpeg)
                self.assertEqual(len(requests), 2)
                self.assertGreaterEqual(requests[1] - requests[0], 1)

    def test_each_real_download_is_paced_even_without_rate_limit(self):
        with self.network([self.jpeg, self.jpeg]) as requests:
            self.mod.download(self.entry['imageUrl'])
            self.mod.download(self.entry['imageUrl'])
        self.assertEqual(len(requests), 2)
        self.assertGreaterEqual(requests[0], 1)
        self.assertGreaterEqual(requests[1] - requests[0], 1)

    def test_persistent_rate_limit_stops_after_three_attempts(self):
        with self.network([self.http_error(429, '0') for _ in range(4)]) as requests:
            with self.assertRaises(urllib.error.HTTPError):
                self.mod.download(self.entry['imageUrl'])
        self.assertEqual(len(requests), 3)
        self.assertTrue(all(later - earlier >= 1 for earlier, later in zip(requests, requests[1:])))

    def test_forbidden_and_permanent_network_errors_are_not_retried(self):
        for error in [self.http_error(403, '2'), self.http_error(404), urllib.error.URLError('unavailable')]:
            with self.subTest(error=type(error).__name__), self.network([error, self.jpeg]) as requests:
                with self.assertRaises(urllib.error.URLError):
                    self.mod.download(self.entry['imageUrl'])
                self.assertEqual(len(requests), 1)

    def test_overlong_retry_after_is_refused_instead_of_retrying_early(self):
        for retry_after in ['61', 'Thu, 01 Jan 1970 00:01:02 GMT']:
            with self.subTest(retry_after=retry_after), self.network([
                    self.http_error(429, retry_after), self.jpeg]) as requests:
                with self.assertRaises(urllib.error.HTTPError):
                    self.mod.download(self.entry['imageUrl'])
                self.assertEqual(len(requests), 1)

    def test_download_error_identifies_record_without_server_details_or_partial_writes(self):
        first = dict(self.entry, id='pbs-first', visualApproved=True)
        with self.network([self.jpeg, self.http_error(403)]):
            with self.assertRaises(ValueError) as caught:
                self.mod.import_entries(self.root, [first, self.entry])
        self.assertIn('pbs-test', str(caught.exception))
        self.assertIn('403', str(caught.exception))
        self.assertNotIn('server detail', str(caught.exception))
        self.assertEqual(json.loads(self.data.read_text()), self.original)
        self.assertFalse((self.topic / 'assets').exists())

    def test_injected_fetch_does_not_wait_for_network_pacing(self):
        with patch.object(self.mod, 'time', SimpleNamespace(
                sleep=lambda seconds: self.fail('Injected fetch was paced')), create=True):
            result = self.mod.import_entries(self.root, [self.entry], fetch=lambda url: self.jpeg)
        self.assertEqual(result, {'staged': 1, 'published': 0})

    def test_unapproved_stages_asset_without_changing_canonical(self):
        before = self.data.read_bytes()
        result = self.mod.import_entries(self.root, [self.entry], fetch=lambda url: self.jpeg)
        self.assertEqual(result, {'staged': 1, 'published': 0})
        self.assertEqual(self.data.read_bytes(), before)
        self.assertEqual((self.topic / 'assets/pbs-test.jpg').read_bytes(), self.jpeg)

    def test_approved_inserts_traceable_record_once_preserving_existing_content(self):
        self.entry['visualApproved'] = True
        self.mod.import_entries(self.root, [self.entry], fetch=lambda url: self.jpeg)
        before = self.data.read_bytes()
        self.mod.import_entries(self.root, [self.entry], fetch=lambda url: self.fail('downloaded cached file'))
        self.assertEqual(self.data.read_bytes(), before)
        content = json.loads(before)
        self.assertEqual(content['lesson'], [{'id': 'kept'}])
        self.assertEqual(len(content['images']), 1)
        self.assertEqual(content['images'][0]['kind'], 'pbs')
        self.assertEqual(content['images'][0]['assetPath'], 'assets/pbs-test.jpg')
        self.assertEqual(content['images'][0]['reviewStatus'], 'draft')
        self.assertEqual(content['images'][0].get('credit'), 'Example Author')
        self.assertEqual(content['images'][0].get('licenseLabel'), 'CC BY 2.0')
        self.assertEqual(content['images'][0].get('originUrl'), 'https://commons.wikimedia.org/wiki/File:Example.jpg')
        self.assertEqual(content['images'][0].get('changesNote'), 'اصل تصویر بدون تغییر؛ شرح فارسی آموزشی افزوده شده است.')
        self.assertIn('اصل تصویر بدون تغییر؛ شرح فارسی آموزشی افزوده شده است.', content['images'][0]['note'])
        self.assertEqual(content['images'][0]['sourceRefs'], [{'sourceId': 'pbs-test-source'}])
        self.assertEqual(content['sources'][0]['creator'], 'Example Author')
        self.assertEqual(content['sources'][0]['license'], 'CC BY 2.0')

    def test_rejects_wrong_host_path_filename_and_unsafe_destination(self):
        variants = [
            {'imageUrl': 'https://evil.example/wikipedia/commons/a/ab/Example.jpg'},
            {'imageUrl': 'https://upload.wikimedia.org.evil.example/wikipedia/commons/a/ab/Example.jpg'},
            {'imageUrl': 'https://upload.wikimedia.org/wikipedia/en/a/ab/Example.jpg'},
            {'imageUrl': 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Other.jpg'},
            {'imageUrl': 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg?x=1'},
            {'imageUrl': 'http://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg'},
            {'category': '../outside'}, {'id': '../outside'},
            {'license': 'CC BY-NC 4.0'}, {'visualApproved': 'false'},
        ]
        for change in variants:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.mod.import_entries(self.root, [dict(self.entry, **change)], fetch=lambda url: self.jpeg)
        self.assertFalse((self.topic / 'assets').exists())

    def test_rejects_invalid_jpeg_dimension_mismatch_and_oversize_without_writes(self):
        for content, entry, limit in [
            (b'not a JPEG', self.entry, 10_000_000),
            (self.jpeg, dict(self.entry, width=801), 10_000_000),
            (self.jpeg, self.entry, 100),
        ]:
            with self.subTest(limit=limit, width=entry['width']), self.assertRaises(ValueError):
                self.mod.import_entries(self.root, [entry], fetch=lambda url: content, max_bytes=limit)
        self.assertEqual(json.loads(self.data.read_text()), self.original)
        self.assertFalse((self.topic / 'assets').exists())

    def test_id_collision_does_not_replace_existing_image(self):
        self.data.write_text(json.dumps(dict(self.original, images=[{'id': 'pbs-test', 'caption': 'User content'}])))
        self.entry['visualApproved'] = True
        with self.assertRaises(ValueError):
            self.mod.import_entries(self.root, [self.entry], fetch=lambda url: self.jpeg)
        self.assertEqual(json.loads(self.data.read_text())['images'][0]['caption'], 'User content')

    def test_cc_by_4_original_preserves_creator_license_and_exact_pixels(self):
        self.entry.update(license='CC BY 4.0',
                          licenseUrl='https://creativecommons.org/licenses/by/4.0/',
                          visualApproved=True)
        self.mod.import_entries(self.root, [self.entry], fetch=lambda url: self.jpeg)
        image = json.loads(self.data.read_text())['images'][0]
        self.assertEqual(image['license'], 'CC BY 4.0')
        self.assertEqual(image['credit'], 'Example Author')
        self.assertEqual((self.topic / image['assetPath']).read_bytes(), self.jpeg)


if __name__ == '__main__':
    unittest.main()
