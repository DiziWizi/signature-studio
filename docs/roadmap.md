# Signature Studio — Roadmap

Suggestions and the actions needed to complete them, roughly in the order I'd
ship them.

## Already done (v0.1.0)

- [x] 5 templates, contact/social/custom fields, live preview (3 widths, 3 backgrounds)
- [x] Outlook-safe output: table layout, fully inline styles, text-glyph social chips
- [x] HTML import, clipboard + file export, plain-text version, per-client install guides
- [x] Dark-mode-friendly toggle with dark preview simulation
- [x] Draft autosave + named saved signatures (localStorage)
- [x] Docker / podman packaging, Forgejo Actions CI, tag releases (source archives)
- [x] Browser QA pass (see docs/qa-report.md), all issues found were fixed

## Suggested next steps

**1. Make tag releases fully automatic** *(~5 min, needs Zoey)*
Add a `RELEASE_TOKEN` repo secret (Settings → Actions → Secrets) to
`SlopWare/signature-studio`. The release job is already written and
secret-gated — it activates on the next `v*` tag push with no workflow edit.

**2. Share/import brand presets (JSON)** *(small feature)*
Export the current state as a JSON "brand kit" and import it — teams can share
one signature template; individuals can move between browsers. The state model
is already JSON-serialisable; add two menu items + file pickers.

**3. Drag-and-drop reordering** *(small, nice UX)*
HTML5 drag & drop for social links and custom lines (today: ▲▼ buttons).
Keep the buttons for keyboard users.

**4. Undo / redo** *(small feature)*
Snapshot the state on discrete actions (add/remove/reorder/template change)
and wire Ctrl/Cmd+Z. Typing already has native input undo.

**5. Two or three more templates** *(medium)*
E.g. "Split" (contact details in a right column box), "Roundel" (circular
photo), "Masthead" (big brand block). The renderer is table-string based, so
each template is one new function in `templates.js`.

**6. Live template thumbnails** *(small)*
Render each template picker thumbnail from the current state (miniature
iframes) instead of static CSS mock-ups.

**7. Public repo + Forgejo Pages demo** *(needs Zoey's decision)*
The org is currently public, so making this repo public would allow a live
demo via Forgejo Pages (`Settings → Pages`). Default is private per Zoey's
standing preference — flip it only if wanted.

**8. Automated browser E2E tests** *(medium)*
Playwright (or Puppeteer) tests in CI covering the flows from
`docs/qa-report.md`: sample data → template switch → social CRUD → import →
export. The CI runner needs Chromium installed (`npx playwright install
chromium --with-deps` in the job).

**9. HTML validity check for generated output in CI** *(small)*
Run each template's output through an HTML parser (e.g. Python
`html5lib`/`html.parser`) in the check job to catch malformed markup.

**10. vCard / QR code extras** *(medium)*
Offer a downloadable `.vcf` and a QR code (contact details) as companions to
the signature. Needs a tiny QR encoder (or a local library) — keep it
dependency-free or vendor one file.

**11. Real image icons as an option** *(medium)*
Keep the glyph chips as default, but allow pasting an icon image URL per
social network for pixel-perfect brand icons.

**12. i18n** *(large, low priority unless asked)*
Extract all strings; ship German first if anyone asks.

**13. PWA / offline install** *(small)*
A manifest + service worker makes the tool installable and fully offline.

**14. Import from more real-world signatures** *(ongoing)*
The importer is heuristic. Collect real signature HTML (Gmail/Outlook
exports) and extend `import.js` patterns — e.g. Outlook `mso` markup and
Gmail's `<style>`-stripped output.

## Known limits (by design)

- No server-side image hosting — hosted URLs are the reliable model for email
  clients; nothing to maintain.
- No multi-user/cloud sync — privacy-first local model.
- Outlook rendering can only be fully verified in Outlook itself; templates
  follow its constraints (tables, inline styles, no flex/grid).
