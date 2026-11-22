#!/usr/bin/env python3
"""Build the deployable archive: the app, not the repository.

Usage: python3 tools/make_app_zip.py [--version X.Y.Z]
Writes dist/signature-studio-<version>-app.zip with the web-root contents at
the zip root (unzip into a web root and you are done)."""
import argparse
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'nginx.conf',
         '_headers', 'vercel.json']
DIRS = ['assets', 'deploy']


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--version')
    args = ap.parse_args()
    version = args.version
    if not version:
        version = json.load(open(os.path.join(ROOT, 'package.json'), encoding='utf-8'))['version']
    out_dir = os.path.join(ROOT, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'signature-studio-{version}-app.zip')
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            z.write(os.path.join(ROOT, name), name)
            count += 1
        for d in DIRS:
            base = os.path.join(ROOT, d)
            for root, _, files in os.walk(base):
                for f in files:
                    full = os.path.join(root, f)
                    z.write(full, os.path.relpath(full, ROOT))
                    count += 1
    size = os.path.getsize(out)
    print(f'wrote {out} ({count} files, {size/1024:.0f} KB)')


if __name__ == '__main__':
    main()
