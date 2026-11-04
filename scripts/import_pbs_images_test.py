"""Offline behavioral checks for the curated PBS importer (no network calls)."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

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


if __name__ == '__main__':
    unittest.main()
