#!/usr/bin/env python3
"""Build the source release archives with the product's full name.

    python3 tools/make_archives.py --version 0.108.3
    python3 tools/make_archives.py --version 0.108.2 --ref v0.108.2

Writes:
    dist/bowerbird-signature-builder-<version>.tar.gz
    dist/bowerbird-signature-builder-<version>.zip

The archive root is `bowerbird-signature-builder-<version>/`. Never name a
release artefact `bowerbird-<version>`: "Bowerbird" is the family mark, not
the app, and the bare form is what this script exists to eliminate.
"""

import argparse
import gzip
import hashlib
import os
import subprocess
import sys

PREFIX_NAME = "bowerbird-signature-builder"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="release version, e.g. 0.108.3")
    ap.add_argument("--ref", default="HEAD", help="git ref/tag to archive (default HEAD)")
    ap.add_argument("--out", default="dist", help="output directory (default dist)")
    args = ap.parse_args()

    version = args.version.lstrip("v")
    stem = f"{PREFIX_NAME}-{version}"
    prefix = f"{stem}/"
    os.makedirs(args.out, exist_ok=True)

    tar_path = os.path.join(args.out, f"{stem}.tar.gz")
    zip_path = os.path.join(args.out, f"{stem}.zip")

    tar = subprocess.run(
        ["git", "archive", "--format=tar", f"--prefix={prefix}", args.ref],
        check=True, capture_output=True,
    ).stdout
    with open(tar_path, "wb") as fh:
        # mtime=0 keeps the gzip wrapper deterministic; git archive already
        # pins file contents and timestamps to the commit.
        with gzip.GzipFile(fileobj=fh, mode="wb", mtime=0) as gz:
            gz.write(tar)

    subprocess.run(
        ["git", "archive", "--format=zip", f"--prefix={prefix}",
         "-o", zip_path, args.ref],
        check=True,
    )

    for path in (tar_path, zip_path):
        digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
        print(f"{digest}  {os.path.basename(path)}  ({os.path.getsize(path)} bytes)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
