# Changelog

All notable changes to Signature Studio. Versions are tagged in the Forgejo
repository and mirrored to GitHub.

## 0.108.1 — 2026-11-23

### Changed
- Product title is **Bowerbird Signature Builder** — the family name plus the
  app name. The top bar shows the full name, the tagline reads “A Bowerbird
  app”, and the manifest short name is “Signature Builder”.
- Added `docs/family.md`: Bowerbird is the shared family (Contact Porter,
  Signature Builder, Email), not the name of any one app or agent.

## 0.108.0 — 2026-11-23

### Changed
- Renamed the product to **Bowerbird Signature Builder**: UI name, page
  title, PWA manifest, locales, README/docs, app archive and backup download
  names.
- Technical identifiers stay for compatibility: repository slug
  `signature-studio`, `sigstudio.*` storage keys, service-worker cache prefix
  and the backup `app` field.

## 0.107.2 — 2026-11-23

### Documentation
- Corrected the GHCR trigger note: `v0.107.1` did build, smoke-test and push
  `ghcr.io/diziwizi/signature-studio`; mirrored tags can be delayed. Package
  starts private. No product change.

## 0.107.1 — 2026-11-23

### Documentation
- Recorded that mirrored tags may not trigger GitHub Actions when the mirror
  pushes with `GITHUB_TOKEN`; document PAT/dispatch options and a verification
  command. No product change.

## 0.107.0 — 2026-11-23

### Added
- GHCR workflow (`container-image`) for building, smoke-testing and pushing a
  multi-arch image from mirrored tags, with Forgejo remaining canonical.
- `docs/github-container.md`: permissions, tags, digest pinning, failure modes
  and supply-chain notes.
- README link and 1.0 hardening notes.

## 0.106.0 — 2026-11-23

### Added
- Team Outlook pack: one classic Outlook folder per bulk CSV row, with
  relative images, `team-index.csv` skip reasons and a README.

## 0.105.0 — 2026-11-23

### Added
- Compact one-row phone header with secondary actions behind ⋯.
- Section open state remembered; phones open the first two.

## 0.104.0 — 2026-11-23

### Added
- Touch reorder via 36 px arrows; drag handles hidden on coarse pointers.
- Wrapping social/custom rows, keyboard-safe fields and landscape modals.

## 0.103.0 — 2026-11-23

### Added
- Two-pane layout from 840×561, including unfolded foldables; dual-screen
  viewport segments; portrait tablets use the peek sheet.

## 0.102.0 — 2026-11-23

### Fixed
- One preview on phones (FAB/peek), safe areas, `100dvh`, 36–40 px touch
  targets and a 320 px overflow.

## 0.101.0 — 2026-11-23

### Added
- `CHANGELOG.md`, browser-support and 1.0-scope sections in the README.
- Accessibility metadata for the proof dialog (`aria-describedby`), the
  dark-logo URL field, and the template empty state.

### Changed
- README corrected to 25 templates and the current export/install routes.

## 0.100.0 — 2026-11-23

### Fixed
- Hints inside fields no longer inherit uppercase, letterspacing and 600
  weight from the field label.
- Logo, dark-logo and portrait URL rows wrap at phone widths instead of
  squeezing the input between buttons.
- Text inputs are 16 px under 520 px, stopping iOS Safari zoom on focus.
- Toasts sit clear of the Preview button on phones.

### Added
- A 4×-CPU budget test proving template thumbnails stay lazy.

## 0.99.0 — 2026-11-23

### Added
- Classic Outlook signature-folder ZIP: `<name>.htm`, `<name>_files/` images
  and a README for `%APPDATA%\Microsoft\Signatures`.

### Notes
- Classic Outlook on Windows only; new Outlook, web and Mac use their own
  editors.

## 0.98.0 — 2026-11-23

### Added
- Template search, a curated **Start here** set, live result count and an
  empty state. Categories and search intersect.

## 0.97.1 — 2026-11-23

### Fixed
- Stale 3,000-character assertion for the huge-share-link test (the case is
  3,017 characters and still openable). No product change.

## 0.97.0 — 2026-11-23

### Added
- Optional dark-mode logo, swapped in `prefers-color-scheme: dark` and hidden
  inline so Outlook keeps the light mark.
- Dark logo travels through IndexedDB, CID packages, test emails and backups.

## 0.96.0 — 2026-11-23

### Added
- Whole-library visual matrix: LTR, RTL, strict Outlook and narrow widths.

### Fixed
- RTL bidi: phone numbers no longer reverse; legal punctuation stays put.

## 0.95.1 — 2026-11-23

### Added
- iPhone/iPad install tab: plain-text export, Settings → Apps → Mail →
  Signature, Per Account, and the text-only/no-sync limits.

## 0.95.0 — 2026-11-23

### Added
- Backup verification before download, last-backup age in the Saved panel,
  and an amber nudge when storage is evictable and the backup is stale.

## 0.94.0 — 2026-11-22

### Added
- Right-to-left content: direction control, reversed cell flow, mirrored
  alignment, padding, margins and borders; mobile stacking follows.

## 0.93.0 — 2026-11-22

### Added
- **Test in a real inbox**: a multipart `.eml` with inline (CID) images and a
  seven-point checklist.
- mailbox.org BIMI note.

### Fixed
- Social chips are table cells with ASCII-safe glyphs — no more blank bars in
  the Word engine.
- Clipboard failure no longer leaks a raw i18n key.

## 0.92.0 — 2026-11-22

### Added
- mailbox.org install tab and **Save reply variant** for OX's separate reply
  slot.

### Fixed
- Image packing no longer replaces the live preview's data URLs with `idb:`
  references after autosave.

## 0.91.0 — 2026-11-22

### Added
- Persistent-storage request and status; evicted images are reported with a
  Restore-backup action.
- Hostile-input suite for ZIP, MIME, quoted-printable, deep HTML and vCards.

### Fixed
- Invalid base64 no longer throws out of the email importer.

## 0.90.0 — 2026-11-22

### Added
- Layout variants: mirrored columns, photo above/beside, compact spacing.
- Undo history stores image references with a 6 MB budget and hydrates on
  undo/redo.
