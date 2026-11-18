# Signature Studio — Roadmap

Suggestions and the actions needed to complete them, roughly in the order I'd
ship them. Checked items are shipped (v0.1.0 / v0.2.0).

## Shipped

- [x] v0.1.0 — 5 templates, live preview, Outlook-safe output, HTML import,
  clipboard/file export, install guides, dark-mode toggle, autosave + saved
  signatures, Docker packaging, Forgejo CI, tag releases
- [x] v0.2.0 — JSON brand presets (export/import)
- [x] v0.2.0 — drag-and-drop reordering (keyboard ▲▼ kept)
- [x] v0.2.0 — undo/redo on structural actions (buttons + Ctrl/Cmd+Z, Ctrl+Shift+Z)
- [x] v0.2.0 — 3 new templates: Split, Roundel, Masthead
- [x] v0.2.0 — live template thumbnails (real renders of the current state)
- [x] v0.2.0 — vCard (.vcf) download + QR code (vendored MIT encoder)
- [x] v0.2.0 — real image icons per social network
- [x] v0.2.0 — PWA/offline (manifest, icons, cache-first service worker)
- [x] v0.3.0 — mobile-friendly: fluid width + media-query column stacking
  (toggleable), Phone preview shows the real mobile layout
- [x] v0.3.0 — Monogram template + initials-monogram option for all layouts
- [x] v0.3.0 — pronouns field, divider style (solid/dashed/dotted), contact
  labels toggle, signature name field
- [x] v0.4.0 — logo position (left/right of name) in Classic, Compact and
  Split; position guessed on HTML import; monogram follows the position
- [x] v0.4.1 — logo position enabled for the Banner layout too (its content
  renders through the Classic layout)
- [x] v0.5.0 personal pack — 7 one-click colour themes; 14 personal/creator
  networks (Medium, Substack, Behance, Dribbble, Twitch, Discord, Etsy,
  Vimeo, Goodreads, Letterboxd, Spotify, Ko-fi); status badge; preferred
  name + location + languages; booking-link chip
- [x] v0.6.0 guidance pack — first-run setup wizard (Guide button re-opens);
  sample data cycles 5 personas; quick-switch saved signatures; conciseness
  hint with live line/width verdict
- [x] v0.7.0 flair pack — card wrapper (tint + border), round-photo crop for
  side logos, Photo card template (10 total), portfolio link split from
  website (signature, plain text, vCard, import)
- [x] v0.8.0 — pre-export checklist (missing name/email, embedded images,
  empty socials) + "where to host my image" helper in the logo field
- [x] v0.9.0 — square centre-crop for logo uploads (portrait photos no
  longer stretch); vCard 4.0 export with PRONOUN + portfolio URL
- [x] v0.10.0 — real-world import fixtures (Gmail, Gmail+image, Outlook
  desktop with pt sizes, Apple Mail) as a browser-side test suite;
  importer accepts pt font sizes for legal-line detection
- [x] v0.11.0 — Playwright E2E suite (29 tests: boot/wizard, persona cycle,
  all 10 templates, socials CRUD + reorder, checklist, square crop, import
  fixtures, exports incl. clipboard + downloads, undo/redo, presets, PWA
  offline) running in CI on every push and tag; repo made public
- [x] v0.12.0 — Outlook strict mode (preview/export without rounded corners
  so Word-engine Outlook matches what you see); wizard usability pass
  (labelled theme swatches, persona descriptions, step indicator, consistent
  "start clean" wording); fixed one-slot-down drag-and-drop no-op; E2E now
  covers real mouse-path drags (4 tests) + strict mode (35 total)
- [x] v0.13.0 — export-time Outlook warning (Copy/Download HTML intercept
  when rounded corners are on: export anyway, or one click to strict mode
  and export); live persona thumbnails in the wizard (real scaled renders
  of each starter signature); E2E now 38 tests
- [x] v0.14.0 — Show/hide element toggles (title, company, department,
  location, every contact item, booking, status, socials — any layout);
  density presets (airy/regular/compact) and a name-size boost slider;
  editor section count badges + open/closed state remembered; E2E now 42
- [ ] Live demo — skipped for now (user decision, 2026-11-19). This
  instance (17.0.1+gitea-1.22.0) has **no Pages feature** — Gitea removed
  it from the 1.21 base; there is no `[pages]` config and no Pages API.
  If revisited: (a) Caddy site block on the existing host
  (e.g. sig.dizi.dev) with a git-hook/webhook auto-deploy, or (b) a public
  GitHub Pages mirror fed by a Forgejo push mirror.

## Suggested next steps

**1. Make tag releases fully automatic** *(~5 min, needs Zoey)*
Add a `RELEASE_TOKEN` repo secret (Settings → Actions → Secrets) to
`SlopWare/signature-studio`. The release job is already written and
secret-gated — it activates on the next `v*` tag push with no workflow edit.

**2. Public repo + Forgejo Pages demo** *(needs Zoey's decision)*
The org is currently public, so making this repo public would allow a live
demo via Forgejo Pages (`Settings → Pages`). Default is private per Zoey's
standing preference — flip it only if wanted.

**3. Automated browser E2E tests** *(medium)*
Playwright tests in CI covering the flows from `docs/qa-report.md`: sample →
template switches → social CRUD → drag-drop → undo/redo → preset import →
export. The CI runner needs Chromium installed.

**4. HTML validity check for generated output in CI** *(small)*
Run each template's output through an HTML parser in the check job to catch
malformed markup before release.

**5. Import from more real-world signatures** *(ongoing)*
The importer is heuristic. Collect real signature HTML (Gmail/Outlook
exports) and extend `import.js` patterns — e.g. Outlook `mso` markup and
Gmail's `<style>`-stripped output.

**6. QR code extras** *(small, optional)*
Sizes / PNG download for the QR; today it's a scan target in a modal. The
encoder already supports it.

**7. i18n** *(large, low priority unless asked)*
Extract all strings; ship German first if anyone asks.

## Known limits (by design)

- No server-side image hosting — hosted URLs are the reliable model for email
  clients; nothing to maintain.
- No multi-user/cloud sync — privacy-first local model.
- Outlook rendering can only be fully verified in Outlook itself; templates
  follow its constraints (tables, inline styles, no flex/grid).
- Service worker is cache-first: developers must bump `VERSION` in `sw.js`
  after code changes (documented in the README).
