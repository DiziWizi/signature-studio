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
