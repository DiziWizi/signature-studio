#!/usr/bin/env python3
"""Guard the self-host story: the image is the app, never a checkout.

Fails if the Dockerfile copies the working tree, if .dockerignore stops
excluding dev/test material, or if a COPY source does not exist.
Run from the repo root (CI does this in the check job)."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED_IGNORES = ['e2e/', 'test-results/', 'docs/', 'node_modules/', '.forgejo/']
COPY_OK = {'index.html', 'sw.js', 'manifest.webmanifest', 'assets', 'nginx.conf'}

errors = []

dockerfile = open(os.path.join(ROOT, 'Dockerfile'), encoding='utf-8').read()
ignore_path = os.path.join(ROOT, '.dockerignore')
ignore = open(ignore_path, encoding='utf-8').read() if os.path.exists(ignore_path) else ''

if re.search(r'^COPY\s+\.\s', dockerfile, re.M):
    errors.append('Dockerfile still does `COPY .` — use an allow-list')

for line in re.findall(r'^COPY\s+(.+)$', dockerfile, re.M):
    parts = line.split()
    sources = parts[:-1]
    for src in sources:
        if src.startswith('--'):
            continue
        if src not in COPY_OK:
            errors.append(f'Dockerfile COPYs unexpected source: {src}')
        if not os.path.exists(os.path.join(ROOT, src)):
            errors.append(f'Dockerfile COPY source missing on disk: {src}')
    if not sources:
        errors.append(f'COPY line has no sources: {line}')

for need in REQUIRED_IGNORES:
    if not re.search(rf'^{re.escape(need)}', ignore, re.M):
        errors.append(f'.dockerignore no longer excludes {need}')

nginx_path = os.path.join(ROOT, 'nginx.conf')
nginx = open(nginx_path, encoding='utf-8').read() if os.path.exists(nginx_path) else ''
if 'Content-Security-Policy' not in nginx:
    errors.append('nginx.conf has no Content-Security-Policy')
if 'X-Frame-Options' not in nginx:
    errors.append('nginx.conf has no X-Frame-Options')

if errors:
    print('self-host check FAILED')
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('self-host check OK: image = app allow-list, dev material excluded, CSP present')
