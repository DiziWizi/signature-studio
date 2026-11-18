# Signature Studio — QA report

Date: 2026-11-18 · Tester: Hermes Agent (browser-exec, Chromium) · Target:
`http://127.0.0.1:8137` (static server) and a podman-built container.

## Scope

Full app: renderer (all templates), editor bindings, socials/custom-lines CRUD,
image upload, import, export (clipboard/download/instructions), saved panel,
reset, persistence, responsive layout, container deployment. Outlook
desktop (Word engine) rendering is **not** verifiable in a headless browser —
templates follow its constraints; see residual risks.

## Issues found and fixed

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | High | Preview and autosave relied on debounced `setTimeout`, which is throttled in background/hidden tabs — in testing, state changed but the preview never re-rendered and drafts lagged. | Preview renders synchronously on every change; autosave is time-throttled (≤1 write/s) with a `beforeunload`/`visibilitychange` flush. |
| 2 | Medium | Instructions modal had no close button (Esc/backdrop only). | Added a Close action. |
| 3 | Medium | HTML import missed names/titles: `innerText` on a detached DOMParser document collapses line breaks. | Extract text lines by splitting the raw HTML on block boundaries (`<br>`, `</td>`, `</div>`, …). |
| 4 | Medium | Import never detected legal lines: the font-size regex `[0-9]([.,][0-9])?` matches only single-digit sizes, so `font-size:10px` failed. | New regex `([0-9.]+)px` with a single parse/filter pass. |
| 5 | Low | Renderer had no numeric clamping: a cleared/imported fontSize or logoWidth could produce degenerate output. | `renderSignature` clamps fontSize to 10–18 and logoWidth to 20–300. |
| 6 | Low | Sample data set website label = URL, rendering the redundant "x: x" line. | Sample leaves the label empty (default "Web:" label is used). |
| 7 | Low | Quick-add social chips were grey while the preview chips are brand-coloured. | Chips now use each network's brand colour. |
| 8 | Low | Default OS scrollbars clashed with the UI. | Slim themed scrollbars (WebKit + Firefox). |

Also fixed pre-QA (code review): a broken dark-mode class hack in social
labels, empty-style template literal and colspan fragility in the compact
layout, a broken Esc-key condition, and a missing switch-knob span in the
markup.

## Verification evidence (all passed after fixes)

- Renderer unit smoke (Node): all 5 templates produce valid documents;
  escaping of `<script>`, `&`, `"` in user input verified; dark-mode block and
  meta tags only when enabled; plain-text export correct.
- Browser: zero console errors across the full flow; all 5 template switches
  re-render distinctly; social style icons/labels/labels-switch verified in
  output; custom network (glyph + colour) rendered; handle→URL normalisation
  ("janedoe" → linkedin URL); logo data-URI upload with warning toast; import
  of a representative signature recovered name, title/department, email,
  phone, website, 2 socials, logo and legal line; clipboard write succeeds
  with permission granted; instructions modal tabs all switch; Esc closes
  modals; reset clears draft but keeps snapshots; draft + snapshots persist
  across reloads; empty state renders no `NaN`/`undefined`/`null`; mobile
  (420 px) stacks without horizontal scroll.
- Container: `podman build` succeeds; running container serves index, CSS and
  JS (curl 200s) — verified on the test VM (Fedora Silverblue, podman 5.8).
- CI: Forgejo Actions `check` job green on `main` (run 1236): JS syntax
  checks, Python compile, static smoke test.

## Residual risks

1. **Outlook desktop rendering** — can't be exercised headlessly. The output
   follows Outlook constraints (tables, inline styles, no flex/grid, explicit
   widths), and the in-app guide says to send a test email. Consider a manual
   check on a real Outlook client before a wide rollout.
2. **Gmail dark-mode inversion** — mitigated by the dark-mode-friendly toggle;
   behaviour differs by client version.
3. **Clipboard API** requires a secure context and user gesture in some
   browsers; the legacy `execCommand` fallback and download option cover it.
4. **Data-URI images** are embedded on upload but many clients strip them;
   the app warns and recommends hosted URLs.

---

# v0.2.0 addendum

Date: 2026-11-19 · Scope: brand presets, drag-drop, undo/redo, 3 new
templates, live thumbnails, vCard/QR, image icons, PWA/offline.

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Medium | Template thumbnails rendered only a ~20 px sliver: `sandbox=""` gives iframes an opaque origin, so `contentDocument` is null from the parent and the load-time height sync silently failed, leaving the default 150 px iframe. | Fixed 360 px CSS height for thumbnails (container crops), removed the cross-origin height logic. |
| 2 | Medium | Service worker 404: the SW was created at `assets/sw.js`, but it must live at the root to take `/` scope (and the app registers `sw.js` at root). | Moved to `sw.js` at root; PRECACHE paths are root-relative and now resolve. |
| 3 | Low | Masthead template dropped title/department when the company band was absent (no company → those fields vanished). | Fall back to the normal title/company lines under the name when there's no band. |
| 4 | Low | vCard `URL:` field emitted the raw website value without a scheme. | Normalize through the app's URL normalizer (https:// prepended when missing). |
| 5 | Low | Test-harness lesson: two v0.2 test assertions were wrong (expected trailing `;` in `ORG`, comma in the wrong ADR component) — the vCard output itself was valid RFC 2426. No code change. |

## Verification evidence (all passed)

- Node vm suite: **58/58** — 8 templates × structure checks (doctype, name,
  balanced tables, no NaN/undefined) + template markers (split card, roundel
  border-radius, masthead band) + image-icon replacement + vCard
  (FN/N/ORG/ADR escaping, folding ≤ 76, URL normalised) + QR (HELLO WORLD →
  21 modules, ~400-char vCard encodes).
- Browser: all 8 templates render distinct output; all 8 live thumbnails
  populated with template-specific content (pixel-verified: 11–40 % non-white
  per tile, masthead band present); undo/redo via buttons and Ctrl+Z /
  Ctrl+Shift+Z; drag-drop reorders socials and custom lines and is undoable;
  image-icon toggle renders `<img>` chip; preset export + import round-trip +
  invalid-JSON rejection; vCard download; QR modal renders a real scannable
  pattern (three finder squares present, pixel-verified); typing latency with
  8 live thumbnails ≈ 1.2 ms avg per keystroke; full interaction sweep zero
  console errors; mobile 420 px no horizontal scroll.
- PWA: SW registers at `/` scope, activates, precaches all 16 files; the app
  loads and edits **fully offline** (Network.emulateNetworkConditions).
- Packaging unchanged (static files); container smoke test from v0.1.0 still
  applies to the same serving model.

## Residual risks (added)

- Real-device DnD: drag-drop was exercised via synthetic DragEvents plus the
  ▲▼ fallback; a quick manual drag on a real browser is worth doing once.
- QR scanning was verified structurally (finder patterns, standard encoder),
  not with a phone camera.
- Cache-first SW means stale content after upgrades until `VERSION` is bumped
  — documented in the README.

---

# v0.3.0 addendum

Date: 2026-11-19 · Scope: mobile-friendly output, Monogram template, pronouns,
divider styles, contact-labels toggle, initials monogram, signature name.

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Medium | Generated signatures were fixed at 600 px (`style="width:600px"`): on phones they clipped instead of shrinking. | Inner table is now fluid: `width="600"` attribute (Outlook) + `style="width:100%;max-width:600px"` (modern clients). |
| 2 | Medium | The full-size preview iframe is exactly 600 px wide, so a `max-width:600px` mobile breakpoint matched there and the desktop preview showed the stacked layout. | Breakpoint set to 599 px — identical behaviour in real clients (phones ≤ 480, desktop bodies wider), correct desktop preview. |
| 3 | Low | Switching the preview width didn't re-sync the iframe height (srcdoc doesn't reload, so the media-query reflow left a scrollbar). | Explicit height re-sync after width changes. |
| 4 | Low | Test-session lesson: the app re-registers the cache-first service worker on every load, so a filesystem change after the last precache left the test browser running stale code (a `Network.setCacheDisabled` doesn't bypass SWs). | Unregister + clear caches + reload in one sequence when files changed; SW VERSION bumped for the release. |

## Verification evidence (all passed)

- Node vm suite: **76/76** across 9 templates — structure, fluid width, mobile
  media block on/off, m-cell markers, pronouns, labels off, divider
  dashed/dotted, monogram fallback + template, empty-state renders.
- Browser: inner table measured 600 px at Full and 325 px at Phone (shrinks,
  no clipping); `m-cell` computed `table-cell` at 600 px and `block` at
  340/460 px (stacking); stackMobile toggle restores table-cell at phone
  width; monogram, divider style, labels, pronouns, signature name all bound
  and rendered; preview height re-syncs 323 → 342 px on width change; 9
  live thumbnails; full sweep zero console errors.
- Screenshot pixel checks confirm the phone preview shows a narrow stacked
  signature (vision-verified).

## Residual risks (added)

- Media-query stacking is verified in Chromium; Gmail/Apple Mail honour the
  same `@media` mechanism but a one-off check on a real phone mail app is
  worthwhile. Outlook ignores the block by design (desktop client).

---

# v0.4.0 addendum

Date: 2026-11-19 · Scope: logo position (left/right of the name block) in
Classic, Compact and Split; import-time position detection.

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Low | Import position heuristic used the wrong `compareDocumentPosition` bit (`PRECEDING` = logo before text), so the detected side was inverted. | Use `DOCUMENT_POSITION_FOLLOWING` (logo after text → right). |
| 2 | Low | Test-session only: `fetch(..., {cache:'no-store'})` does not bypass a service worker, so a "fresh" evaluation still ran cached code. | Verify via unregister + clear caches + re-navigate in one sequence; bitmask probe confirmed the fix on live code. |

## Verification evidence (all passed)

- Node vm suite: **67/67** — cell order for Classic/Compact/Split × both
  positions (logo-first vs name-first), right-position padding marker,
  monogram respects position, all 9 templates × both positions render
  balanced/fluid/NaN-free, default `logoPosition` present.
- Browser: Position select binds and re-renders (name before logo in
  srcdoc when right); select disabled with hint on Centered/Roundel/Monogram
  and re-enabled on Classic; live thumbnails reflect the position; import
  detection returns right for text-then-logo and left for logo-then-text
  (verified on live code after SW cache reset); full sweep zero console
  errors; screenshot vision-verified (logo placeholder right of the name
  block, text shifted left).

## Residual risks (added)

- None beyond the existing list.
