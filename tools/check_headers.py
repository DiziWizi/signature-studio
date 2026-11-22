#!/usr/bin/env python3
"""Fail if the hosting configs drift from the CSP in nginx.conf.

The policy is security-critical and now lives in four places (nginx, Netlify /
Cloudflare Pages, Vercel, Caddy). Comparing the exact string is crude but
catches the only failure that matters: one host silently shipping a weaker
policy than the others.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path: str) -> str:
    with open(os.path.join(ROOT, path), encoding='utf-8') as fh:
        return fh.read()


def nginx_csp(text: str) -> str:
    match = re.search(r'Content-Security-Policy\s+"([^"]+)"', text)
    return match.group(1) if match else ''


def netlify_csp(text: str) -> str:
    match = re.search(r'^\s*Content-Security-Policy:\s*(.+)$', text, re.MULTILINE)
    return match.group(1).strip() if match else ''


def vercel_csp(text: str) -> str:
    data = json.loads(text)
    for block in data.get('headers', []):
        for header in block.get('headers', []):
            if header.get('key', '').lower() == 'content-security-policy':
                return header.get('value', '')
    return ''


def caddy_csp(text: str) -> str:
    match = re.search(r'Content-Security-Policy\s+"([^"]+)"', text)
    return match.group(1) if match else ''


def main() -> int:
    sources = {
        'nginx.conf': nginx_csp(read('nginx.conf')),
        '_headers': netlify_csp(read('_headers')),
        'vercel.json': vercel_csp(read('vercel.json')),
        'deploy/Caddyfile.example': caddy_csp(read('deploy/Caddyfile.example')),
    }
    missing = [name for name, value in sources.items() if not value]
    if missing:
        print('CSP missing from: ' + ', '.join(missing))
        return 1
    unique = set(sources.values())
    if len(unique) != 1:
        print('CSP drift detected:')
        for name, value in sources.items():
            print(f'  {name}: {value}')
        return 1
    policy = unique.pop()
    required = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
                "frame-ancestors 'none'", "object-src 'none'"]
    for needle in required:
        if needle not in policy:
            print(f'CSP is missing: {needle}')
            return 1
    if "script-src 'self' 'unsafe-inline'" in policy:
        print('script-src must not allow unsafe-inline')
        return 1
    print('headers check OK — one policy across nginx, Netlify/Cloudflare, Vercel and Caddy')
    return 0


if __name__ == '__main__':
    sys.exit(main())
