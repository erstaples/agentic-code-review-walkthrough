"""Archive boundary regressions; native tests separately exercise the real VSIX."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('check_vsix', Path(__file__).with_name('check-vsix.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ArchiveChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.vsix = self.root / 'test.vsix'
        self.contents = {}
        for name, relative in checker.ARTIFACTS.items():
            data = (json.dumps({'main': './dist/extension.js', 'version': '0.1.0'}).encode()
                    if relative == 'package.json' else relative.encode())
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            self.contents[name] = data
        self.contents.update({name: b'<metadata/>' for name in checker.METADATA})

    def inspect(self):
        with zipfile.ZipFile(self.vsix, 'w') as archive:
            for name, data in self.contents.items():
                archive.writestr(name, data)
        return checker.inspect(self.vsix, self.root)

    def test_current_allowlisted_archive(self):
        self.assertEqual(self.inspect(), 11)

    def test_rejects_source_tests_dependencies_and_legacy_entry(self):
        for name in ('extension/extension.js', 'extension/src/extension.ts',
                     'extension/test/example.js', 'extension/node_modules/example.js',
                     'extension/lib/contract.js', 'extension/node_modules/'):
            with self.subTest(name=name):
                self.contents[name] = b''
                with self.assertRaisesRegex(ValueError, 'Unexpected VSIX contents'):
                    self.inspect()
                del self.contents[name]

    def test_rejects_missing_bundle(self):
        del self.contents['extension/dist/webview.js']
        with self.assertRaisesRegex(ValueError, 'Unexpected VSIX contents'):
            self.inspect()

    def test_rejects_stale_bundle(self):
        self.contents['extension/dist/extension.js'] = b'old build'
        with self.assertRaisesRegex(ValueError, 'differs from fresh build/source'):
            self.inspect()

    def test_rejects_changed_manifest(self):
        self.contents['extension/package.json'] = b'{"main":"./extension.js","version":"0.1.0"}'
        with self.assertRaisesRegex(ValueError, 'Packaged main differs'):
            self.inspect()

    def test_rejects_duplicate_entries(self):
        self.inspect()
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(self.vsix, 'a') as archive:
                archive.writestr('extension/dist/extension.js', b'duplicate')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            checker.inspect(self.vsix, self.root)


if __name__ == "__main__":
    unittest.main()
