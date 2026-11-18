#!/usr/bin/env python3
"""Idempotent Forgejo release publisher (stdlib only).

Creates or updates a release for a tag and attaches assets, replacing
same-named assets. Token from RELEASE_TOKEN (CI) or the local token file.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("FORGEJO_URL", "https://forgejo.dizi.dev") + "/api/v1"


def api(method, path, token, body=None, ctype=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Authorization", "token " + token)
    if body is not None:
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
            ctype = "application/json"
        req.add_header("Content-Type", ctype or "application/octet-stream")
    try:
        with urllib.request.urlopen(req, body) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {}
        if "token" in raw.decode(errors="replace"):
            data = {"error": "<redacted>"}
        return e.code, data


def get_token():
    tok = os.environ.get("RELEASE_TOKEN", "").strip()
    if tok:
        return tok
    path = os.path.expanduser(os.environ.get("FORGEJO_TOKEN_FILE", "~/.config/forgejo/token"))
    if os.path.exists(path):
        return open(path).read().strip()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--repo", default="SlopWare/signature-studio")
    ap.add_argument("--files", nargs="+", required=True)
    ap.add_argument("--body", default="")
    args = ap.parse_args()

    token = get_token()
    if not token:
        sys.exit("RELEASE_TOKEN missing")
    owner, repo = args.repo.split("/", 1)
    base = f"/repos/{owner}/{repo}"

    code, rel = api("GET", f"{base}/releases/tags/{args.tag}", token)
    if code == 200:
        print(f"release {args.tag} exists (id {rel.get('id')})")
    else:
        code, rel = api("POST", f"{base}/releases", token,
                        {"tag_name": args.tag, "name": args.tag,
                         "body": args.body or f"Release {args.tag}", "draft": False})
        if code not in (201, 409):
            sys.exit(f"create release failed: {code}")
        if code == 409:
            code, rel = api("GET", f"{base}/releases/tags/{args.tag}", token)
            if code != 200:
                sys.exit("release exists but cannot be fetched")
    release_id = rel.get("id")
    if not release_id:
        sys.exit("no release id")

    # Remove same-named assets (idempotency).
    code, assets = api("GET", f"{base}/releases/{release_id}/assets", token)
    wanted = {os.path.basename(f) for f in args.files}
    for a in (assets if isinstance(assets, list) else []):
        if a.get("name") in wanted:
            code, _ = api("DELETE", f"{base}/releases/{release_id}/assets/{a['id']}", token)
            print(f"replaced asset {a.get('name')} ({code})")

    for f in args.files:
        name = os.path.basename(f)
        with open(f, "rb") as fh:
            data = fh.read()
        boundary = "----sigstudio" + os.urandom(8).hex()
        part = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="attachment"; filename="{name}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
        code, resp = api("POST",
                         f"{base}/releases/{release_id}/assets?name={urllib.parse.quote(name)}",
                         token, body=part,
                         ctype=f"multipart/form-data; boundary={boundary}")
        ok = code in (200, 201)
        print(f"upload {name}: {'ok' if ok else code} {resp if not ok else ''}")

    print(f"release ready: https://forgejo.dizi.dev/{owner}/{repo}/releases/tag/{args.tag}")


if __name__ == "__main__":
    main()
