# Building the container on GitHub (GHCR)

Forgejo stays canonical. GitHub is a **push mirror** and a build/host surface
for the container image; it is not a second source of truth.

```
Forgejo (canonical)                     GitHub (mirror)                 GHCR
tag vX.Y.Z ──► release + assets   ──►   tag mirrored ──► Actions ──►   image:tag + digest
                     │                                                   │
                     └──────────── release notes reference digest ◄──────┘
```

## What the workflow does

`.github/workflows/ghcr.yml` runs on mirrored `v*` tags (and via
`workflow_dispatch`):

1. **Builds linux/amd64 locally** and loads it into the runner.
2. **Smoke tests the image**:
   - `/` serves and contains “Signature Studio”;
   - `/assets/styles.css` serves;
   - `/e2e/` returns 404 (the nginx deny list);
   - `X-Content-Type-Options: nosniff` is present.
3. **Builds and pushes multi-arch** (`linux/amd64`, `linux/arm64`) to GHCR,
   with SBOM and provenance attestations.
4. Prints the image digest in the job summary.

Image names and tags come from `docker/metadata-action`:

- `ghcr.io/<owner>/signature-studio:<version>` (e.g. `0.107.0`)
- `ghcr.io/<owner>/signature-studio:<major>.<minor>`
- `ghcr.io/<owner>/signature-studio:sha-<commit>`
- `ghcr.io/<owner>/signature-studio:latest` for `v*` tags

## One-time setup

1. **Mirror tags**: the Forgejo push mirror must include tags. Confirm the
   mirror settings push tags as well as branches; without a mirrored tag the
   workflow never fires.
2. **Actions enabled** on the GitHub repository (Actions → General). The
   workflow needs no secrets: it uses `GITHUB_TOKEN` with `packages: write`.
3. **Workflow permissions**: Settings → Actions → General → Workflow
   permissions → “Read and write permissions” is not required globally if the
   workflow declares `packages: write` (it does), but the organisation must
   allow GitHub Actions to create packages.
4. **Package visibility**: the first push creates a private package. Set it to
   public under Package settings if anonymous `docker pull` is desired;
   otherwise consumers authenticate with a GitHub token.
5. **Tag protection**: protect `v*` tags in Forgejo (the source). GitHub tag
   protection is optional and can conflict with mirror force-updates.

## Consuming the image

```sh
docker pull ghcr.io/<owner>/signature-studio:0.107.0
docker run --rm -p 8080:80 ghcr.io/<owner>/signature-studio:0.107.0
```

Pin by digest for reproducible deployments:

```sh
docker pull ghcr.io/<owner>/signature-studio@sha256:<digest>
```

## Canonicality rules

- Version bumps, tags and release assets are created **only in Forgejo**.
- The GitHub workflow never edits source, creates GitHub releases or pushes
  commits. It builds what the mirrored tag contains.
- If the GitHub build fails, the Forgejo release is still valid; the image is
  a derived artifact, not the release.
- Record the digest in the Forgejo release notes (manually or with a small
  follow-up job) so the image is traceable to the canonical tag.

## Supply-chain notes

- The workflow uses `GITHUB_TOKEN` only; no long-lived registry PAT.
- Provenance and SBOM are enabled; `docker buildx imagetools inspect` shows
  the attestations.
- Pin third-party actions to commit SHAs before treating this as a hardened
  pipeline; major tags are used here for readability.
- The Dockerfile copies an allow-list (`index.html`, `sw.js`, manifest,
  `assets/`, `nginx.conf`), so `e2e/`, `docs/`, `tools/`, `.github/` and
  `node_modules/` cannot enter the image.
- GHCR retention: untagged layers accumulate on frequent builds; add a
  package cleanup rule if that matters.

## Trigger reliability (observed)

Mirrored tags can take a moment — or a second tag — before GitHub shows a
run. In this project, `v0.107.0` produced no run immediately, while `v0.107.1`
produced two successful `container-image` runs and pushed
`ghcr.io/diziwizi/signature-studio:0.107.1` (tags: `0.107.1`, `0.107`,
`latest`, `sha-403976c`). Both the build-and-smoke and multi-arch push steps
succeeded.

If a release tag produces no run:

1. give the Forgejo push mirror a fine-grained PAT with **workflow** scope, or
2. call `workflow_dispatch` / `repository_dispatch` from Forgejo after a
   release, or
3. run the workflow manually once.

Check with `gh run list --repo <owner>/signature-studio --workflow
container-image`. Until a successful run exists, do not assume the tag built
an image. The first push creates a **private** GHCR package; make it public in
package settings if anonymous pulls are wanted.

## Failure modes

| Symptom | Likely cause |
| --- | --- |
| Workflow never runs | Tags not mirrored, or Actions disabled |
| `denied: permission_denied` | `packages: write` missing or org policy blocks packages |
| `invalid reference format` | Uppercase owner in an image name; metadata-action normally lowercases it |
| Smoke test 404 on `/` | Wrong port/context; check `docker run -p` |
| Multi-arch build times out | QEMU on arm64; increase timeout or build arm64 only on release tags |

## Why not build inside Forgejo?

Building in Forgejo is equally valid, but then a registry credential has to
live in Forgejo and the image is built by the same runner that publishes the
release. Using GitHub for the image keeps the canonical release path small and
uses GHCR’s native token/permissions model. The trade-off is one more external
dependency and mirror-tag latency.
