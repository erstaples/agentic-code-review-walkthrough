#!/usr/bin/env python3
"""Check the actual archive, including unexpected files, before publishing."""
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'editor-extension/package.json').read_text())
expected = {
    'extension/package.json', 'extension/extension.js', 'extension/readme.md',
    'extension/changelog.md', 'extension/LICENSE.txt',
    'extension/' + manifest['icon'], 'extension/assets/kanko-sidebar.svg',
    '[Content_Types].xml', 'extension.vsixmanifest',
}
expected.update('extension/' + str(p.relative_to(root / 'editor-extension'))
                for p in (root / 'editor-extension/lib').rglob('*.js'))
expected.update('extension/' + str(p.relative_to(root / 'editor-extension'))
                for p in (root / 'editor-extension/media').glob('*') if p.is_file())
if len(sys.argv) != 2:
    sys.exit('Expected exactly one VSIX path')
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = [item.filename for item in archive.infolist() if not item.is_dir()]
    if len(names) != len(set(names)) or set(names) != expected:
        sys.exit(f'Unexpected VSIX contents: missing={expected - set(names)}, extra={set(names) - expected}')
    packaged = json.loads(archive.read('extension/package.json'))
    for key in ('name', 'displayName', 'publisher', 'version', 'engines', 'main', 'icon', 'galleryBanner'):
        if packaged[key] != manifest[key]:
            sys.exit(f'Packaged {key} differs from source manifest')
    for name in expected:
        if name.startswith('extension/') and name != 'extension/package.json':
            relative = name.removeprefix('extension/')
            relative = {'readme.md': 'README.md', 'changelog.md': 'CHANGELOG.md', 'LICENSE.txt': 'LICENSE'}.get(relative, relative)
            source = root / 'editor-extension' / relative
            if archive.read(name) != source.read_bytes():
                sys.exit(f'Packaged file differs from source: {name}')
print(f'Validated {sys.argv[1]} ({len(names)} files)')
