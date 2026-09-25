#!/usr/bin/env python3
"""Rebuild and compare a VSIX against an explicit shipping artifact allowlist."""
import json
from pathlib import Path
import subprocess
import sys
import zipfile

# Deliberately not derived from globs or package.json's files field: adding a
# shipped artifact requires an explicit review here as well as in the manifest.
ARTIFACTS = {
    'extension/package.json': 'package.json',
    'extension/dist/extension.js': 'dist/extension.js',
    'extension/dist/webview.js': 'dist/webview.js',
    'extension/readme.md': 'README.md',
    'extension/changelog.md': 'CHANGELOG.md',
    'extension/LICENSE.txt': 'LICENSE',
    'extension/assets/kanko-icon-256.png': 'assets/kanko-icon-256.png',
    'extension/assets/kanko-sidebar.svg': 'assets/kanko-sidebar.svg',
    'extension/media/tour.css': 'media/tour.css',
    'extension/THIRD_PARTY_NOTICES.txt': 'THIRD_PARTY_NOTICES.txt',
}
METADATA = {'[Content_Types].xml', 'extension.vsixmanifest'}


def inspect(vsix, extension):
    manifest = json.loads((extension / 'package.json').read_text())
    expected = set(ARTIFACTS) | METADATA
    directories = {str(parent) + '/' for name in expected
                   for parent in Path(name).parents if str(parent) != '.'}
    with zipfile.ZipFile(vsix) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries if not item.is_dir()]
        unexpected_dirs = {item.filename for item in entries if item.is_dir()} - directories
        if len(entries) != len({item.filename for item in entries}):
            raise ValueError('Duplicate VSIX entries')
        if set(names) != expected or unexpected_dirs:
            raise ValueError(f'Unexpected VSIX contents: missing={expected - set(names)}, '
                             f'extra={set(names) - expected}, directories={unexpected_dirs}')
        packaged = json.loads(archive.read('extension/package.json'))
        for key in ('name', 'displayName', 'publisher', 'version', 'engines', 'main',
                    'icon', 'galleryBanner', 'activationEvents', 'contributes', 'files'):
            if packaged.get(key) != manifest.get(key):
                raise ValueError(f'Packaged {key} differs from source manifest')
        if packaged['main'] != './dist/extension.js':
            raise ValueError('Packaged main must use the generated host bundle')
        for name, relative in ARTIFACTS.items():
            if name != 'extension/package.json' and archive.read(name) != (extension / relative).read_bytes():
                raise ValueError(f'Packaged file differs from fresh build/source: {name}')
    return len(names)


def main():
    if len(sys.argv) != 2:
        sys.exit('Expected exactly one VSIX path')
    extension = Path(__file__).resolve().parent.parent / 'editor-extension'
    # Never trust dist left by an earlier package or another checkout.
    subprocess.run(['npm', 'run', 'build'], cwd=extension, check=True)
    try:
        count = inspect(sys.argv[1], extension)
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
    print(f'Validated {sys.argv[1]} ({count} files, fresh build matches)')


if __name__ == '__main__':
    main()
