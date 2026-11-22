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

# v0.5.0–v0.7.0 addendum (personal packs)

Date: 2026-11-19 · Scope: themes, networks, status badge, identity fields,
booking link (v0.5.0); wizard, personas, quick-switch, conciseness hint
(v0.6.0); card wrapper, round photo, Photo card template, portfolio (v0.7.0).

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Medium | First-run wizard auto-open used `setTimeout`, which background tabs throttle — the wizard never opened in testing. | Synchronous `openWizard()` on first run. |
| 2 | Low | A fuzzy patch on `export.js` pushed the website/address lines directly to `lines` instead of the `contact` array, breaking the joined contact line. | Restored the array; booking gets its own line. |
| 3 | Low | Conciseness verdict called a 10-short-line sample "on the long side". | Thresholds tuned (≤5 good, ≤9 compact). |
| 4 | Low | Test assertions only: card-off check matched the booking chip's own `border-radius:12px`; Ko-fi test dispatched events on a detached row after a re-render. | Assertions corrected; no code change. |

## Verification evidence (all passed)

- Node vm: 65/65 (v0.5.0 pack), 22/22 (personas), 41/41 (v0.7.0 pack) —
  themes, 27 networks, badge/context/booking in all layouts, display-name
  in monogram/plain-text/vCard, card on/off and per-template, round photo,
  photo card markers, portfolio in signature/plain text/vCard.
- Browser: theme swatches apply + sync colour inputs; wizard full
  walkthrough (auto-open, 3 steps, finish applies persona+theme+monogram,
  done-flag, Guide re-opens, Skip); sample cycling across personas;
  quick-switch save→switch round-trip; conciseness hint updates live; card
  colour + round photo toggles; photo card tile + live thumbnail; portfolio
  line; zero console errors across the flows.
- Releases v0.5.0, v0.6.0, v0.7.0 published with verified SHA-256 assets;
  CI green on each tag.

## Residual risks (added)

- Wizard/wording has not been seen by a non-technical user; the personas and
  thresholds are sensible defaults, not usability-tested.

---

# v0.8.0–v0.10.0 addendum (export polish + import fixtures)

Date: 2026-11-19 · Scope: pre-export checklist + hosting helper (v0.8.0),
square photo crop + vCard 4.0 (v0.9.0), real-world import fixtures (v0.10.0).

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Low | Legal-line detection only matched px font sizes; Outlook exports use points (8.0pt). | Importer accepts pt with the 1pt ≈ 4/3px conversion; px path unchanged. |
| 2 | Low | The logo field was a `<label>` so an interactive "host my image" helper couldn't nest legally. | Restructured to `div.field` with an explicit label span + `<details>` helper. |

## Verification evidence (all passed)

- Node vm: vCard 4.0 suite 11/11 (envelope, FN/N split, PRONOUN present and
  absent, website + TYPE=portfolio URLs, no folded lines, escaping) plus the
  vCard 3.0 regression (folding ≤ 76, no PRONOUN).
- Browser: square crop verified by decoding the uploaded data URL — a
  200×100 PNG lands as exactly 100×100; banner uploads stay uncropped
  (160×40); checklist states verified (empty → error+warning, sample →
  ready, data: logo → warning, URL-less social → info); hosting helper
  expands; vCard 4.0 menu downloads.
- Import fixtures: `runImportFixtureTests()` in the browser passes **4/4**
  (gmail-basic, gmail-image, outlook-desktop incl. pt legal line + two tel
  links, apple-mail) on live code; `tests/*.js` syntax-checked in CI.
- Releases v0.8.0, v0.9.0, v0.10.0 published with verified SHA-256 assets;
  CI green on each tag.

## Residual risks (added)

- Fixture suite is browser-side only (DOMParser); it runs in the QA pass,
  not in CI — wiring it into a headless-browser CI job is the remaining step
  (already on the roadmap as the Playwright/E2E item).

---

# v0.11.0 addendum (Playwright E2E suite + public repo)

Date: 2026-11-19 · Scope: full browser E2E suite in CI; repo made public for
the upcoming Forgejo Pages demo.

## Notes

- 29 Playwright tests in `e2e/` cover boot/wizard, persona cycling, all 10
  templates via unique srcdoc markers, socials CRUD + reorder, checklist,
  square crop (decoded PNG dimensions), import fixtures (4/4), exports
  (clipboard text/html, .html download, vCard 3.0 + 4.0 downloads, QR
  modal), undo/redo, preset round-trip, PWA offline reload, and HTML import.
- Verified 3× locally (29/29 each, ~6.5 s) and by the parent agent; CI runs
  the suite on every push and tag with `npm ci` + `playwright install
  --with-deps chromium` on the ubuntu-24.04 runner.
- One benign console pattern is documented in `e2e/helper.js`: Playwright's
  injected instrumentation script is blocked by the app's sandboxed
  thumbnail iframes; a boot test asserts that this pattern is the ONLY
  console error the app produces.
- No app bugs surfaced by the suite. Repo made public after a secret scan
  (env-var references only); `publish_release.py` token path is now
  overridable via `FORGEJO_TOKEN_FILE`.

---

# v0.12.0 addendum (strict mode + wizard pass + drag-and-drop coverage)

Date: 2026-11-19 · Scope: Outlook strict mode, wizard usability pass,
one-slot-down DnD fix, real drag coverage in E2E.

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Medium | `finishDrag` guard `to === from + 1` made every one-slot downward move a silent no-op — mouse drags AND the ▼ keyboard button on the first row. Found by the new DnD E2E tests. | Guard reduced to `to === from` (true no-op); the +1 case is a real move after the `to -= 1` decrement. |
| 2 | Low | Wizard theme swatches had no visible names (title attr only) and personas had no descriptions — hard for a first-run user to choose. | Swatch names rendered under each swatch; persona + photo choices now carry descriptions. |
| 3 | Low | Wizard step 3 copy said "or start clean" but the button said "Just personal". | Button renamed to "Start clean"; wording consistent. |
| 4 | Low | Wizard gave no sense of position in the flow. | "Step N of 3" indicator under the title. |
| 5 | Test-only | `.switch` checkboxes are visually hidden, so `page.check()` timed out. | `toggleSwitch()` clicks the label (native activation). |

## Verification evidence (all passed)

- Node vm: strict-mode suite 7/7 (card/badge/booking/chip/monogram radii
  present in normal mode, all absent in strict mode, card border + tint
  survive, toggle round-trips).
- Browser: wizard opens with labelled swatches + step indicator, persona
  descriptions render, "Start clean" present, freelancer applies; strict
  toggle drops every `border-radius` from the preview srcdoc, checklist
  hint appears when card/round are on without strict; zero console errors.
- Playwright: **34/34 twice consecutively** locally (29 prior + strict + 4
  real drag-path tests incl. the fixed one-slot-down gesture, asserted in
  state, DOM and preview order); CI e2e job green on the tag run.

---

# v0.13.0 addendum (export-time warning + wizard persona thumbnails)

Date: 2026-11-19 · Scope: Outlook warning gate on HTML exports, live persona
thumbnails in the wizard.

## Notes

- Copy HTML and Download .html now run through `guardOutlookExport()`: when
  strict mode is off and the signature carries any rounded corners (round
  photo, card, monogram, status badge, booking button, social chips), an
  export-time modal lists exactly what Outlook will square off and offers
  Export anyway / Use strict mode & export / Cancel. With strict mode on
  (or no radius sources), exports go straight through.
- Wizard step 3 persona choices now show a live thumbnail — a scaled-down
  real render of each sample signature (same sandboxed-iframe technique as
  the template picker; data: images stripped). Rendered once per persona
  and cached across selection clicks; "Start clean" intentionally has no
  thumbnail.
- E2E grew to **38 tests**: export-warning.spec covers the warning on copy,
  the strict-apply path (checkbox + subsequent exports skip the gate),
  the already-strict no-warning path, and Cancel on the download path;
  boot.spec asserts all 5 persona thumbnails render. The two pre-existing
  export tests now pre-enable strict mode so they keep testing export
  mechanics rather than the gate.
- Verified: 38/38 twice consecutively locally; browser QA confirmed the
  issue list text, the strict-apply chain (checkbox synced, toast), five
  thumbnails each containing their persona's name + table markup, zero
  console errors; CI e2e job green on the tag run.

---

# v0.14.0 addendum (element visibility + density + name size + sections)

Date: 2026-11-19 · Scope: per-element Show/hide toggles, density presets,
name-size boost, editor section counts and remembered open state.

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Medium | Range inputs arrived as strings in `onFieldInput`, so the name-size boost was silently dropped by the renderer's strict type check (and any future range-bound numeric would hit the same). | `type=range` coerced to Number alongside `number`; `nameExtraOf` also Number()-coerces defensively. |
| 2 | Low | The `+N px` output next to the name-size slider only refreshed on full rebuilds, lagging behind every slider movement. | Output updates in `onFieldInput` for `design.nameSizeExtra`. |
| 3 | Test-only | Density assertions measured the wrong attributes (padding shorthand incl. the mobile media query; chip `height:22px`) until the real convention — spacer rows as `<td colspan height="N">` — was pinned. | Assertions target spacer-row height attributes. |
| 4 | Test-only | Playwright's `fill()` does not dispatch events for range inputs. | Explicit `dispatchEvent(new Event('input'))` in the spec. |

## Verification evidence (all passed)

- Renderer subagent: 71/71 node assertions; 15 pre-change renders (5
  personas × 10 templates) byte-identical (sha256) after the changes;
  density scaling verified per element; name sizes 16/19/24 for extra
  0/3/8; monogram size pinned.
- Browser: toggles remove title/company/phone/address while email/mobile
  survive; counts show 3 socials / 1 custom line; density switches re-render;
  zero console errors.
- Playwright: 42/42 twice consecutively (4 new customize tests: toggle
  sweep, density + font-size invariance, name-size slider + output, section
  counts + persistence across reload).
- Release published with verified SHA-256 assets; CI check + e2e green on
  the tag.

---

# v0.15.0 addendum (socials position + compose-window preview)

Date: 2026-11-19 · Scope: socials placement control, realistic compose
window around the live preview.

## Issues found and fixed in this round

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Test-only | Clicking the visually-hidden radio inputs in `.seg` groups timed out. | Click the wrapping label (`label:has(input[value=…])`), the established pattern. |
| 2 | Test-only | The compose body background has a .2s transition; same-frame computed-style reads were still white, and background tabs freeze transitions entirely. | Test polls until the background settles. |

## Verification evidence (all passed)

- Node vm: socials position suite 25/25 (bottom/underName/inContact ×
  classic/compact/split/minimal, plus default-state regression); default
  renders unchanged.
- Browser: compose window renders with header dots, To/Subject rows and
  the signature below the separator; backdrop toggle moves the body
  white→grey→dark (vision-verified screenshot); zero console errors.
- Playwright: 44/44 twice consecutively (2 new preview tests: socials
  position ordering in srcdoc, compose window + backdrop behaviour).
- Release published with verified SHA-256 assets; CI check + e2e green on
  the tag. README overview screenshot refreshed.

---

# v0.16.0 addendum (accessibility pass)

Date: 2026-11-19 · Scope: keyboard & focus management, screen-reader
support, reduced motion — audited with the better-accessibility skill.

## What changed (subagent audit, all verified)

- Modal focus trap (Tab/Shift+Tab cycle inside), focus moves into the
  dialog on open and restores to the invoking control on close; no-invoker
  closes park focus on `<main>`. Fixed a real bug found empirically:
  Chromium's tab start point persists across blur, so the auto-opened
  wizard stranded focus on a hidden button.
- Switches and segmented radios were `display:none` (no keyboard path) —
  now opacity-0 overlays with Space activation and focus rings.
- `aria-label` on every icon-only button (undo/redo/reset/quick/close,
  row ▲/▼/×, quick-add chips, theme swatches, badge colour); dialogs named
  via `aria-labelledby`; toasts `role=status aria-live=polite`.
- Skip-to-content link as the first tab stop; thumbnail iframes
  `tabindex=-1 aria-hidden`; compose mock chrome hidden from AT.
- Global `:focus-visible` rings; `prefers-reduced-motion: reduce` removes
  toast slide-in, hover scales and transitions.

## Verification

- Playwright: 49/49 twice consecutively (5 new a11y tests: skip link +
  focus ring, wizard focus trap + restore, toast/status + icon labels,
  switch/radio keyboard operation, reduced motion); parent re-ran 49/49.
- Browser spot QA: skip link present, toasts role/live correct, wizard
  focus lands inside the dialog, zero console errors.
- Release published with verified SHA-256 assets; CI check + e2e green on
  the tag.
- Residual: no real screen reader (NVDA/VoiceOver) was run — verified via
  the Chrome accessibility tree and computed styles instead.

---

# v0.17.0 addendum (four new templates)

Date: 2026-11-19 · Scope: Postcard, Line, Duotone, Quote templates + the
optional `quoteText` design field.

## Notes

- Postcard: bordered card, 6px accent strip, centered casual content
  (labels off), socials at the bottom, legal outside the card; strict
  mode drops the radius.
- Line: a single casual row — name, muted title/location/website joined
  with ·, and inline 18px social chips (socialChipHtml gained an optional
  size param; existing calls byte-identical).
- Duotone: 220px accent panel with white name / lighter-white title and
  context (mixColors) beside a white contact column; m-cell stacking on
  phones.
- Quote: optional italic quote (design.quoteText, empty = omitted) above
  the centered identity; freelancer sample carries "Small team, big care."
- Renderer subagent suite 53/53 (14 templates render, 10 pre-existing
  markers hold, new markers exclusive across all 14, hostile quote input
  escaped, socialChipHtml regression byte-identical, toggles respected in
  the new layouts, strict mode strips the postcard radius).
- Two subagent judgement calls reverted by the parent: the default accent
  colour was changed to satisfy a test marker — restored to #2f6fed and
  the marker updated instead; Ada's corporate sample was given a quote —
  removed, the quote E2E now sets the field explicitly.
- Playwright: 53/53 twice consecutively (4 new template-marker tests);
  pixel checks confirm the postcard strip and duotone panel render.
  Templates gallery screenshot refreshed.

---

# v0.18.0 addendum (honorifics, PGP, privacy networks, vCard photo)

Date: 2026-11-19 · Scope: new optional fields flowing through signature,
plain text and both vCards.

## Notes

- Honorifics: honorificPrefix/honorificSuffix render around the name in
  every layout (incl. the duotone white name), the plain-text export, the
  vCard 3.0 N components (Family;Given;;Prefix;Suffix) and vCard 4.0
  HONORIFIC-PREFIX/SUFFIX. FN and monogram initials deliberately exclude
  them.
- PGP: contact.pgpKey renders a PGP line in every layout's contact stack
  (fingerprint truncated to 20 chars + …, or a "Public key" link for URLs)
  and KEY;TYPE=PGP in both vCards.
- vCard photo: design.logoUrl is emitted as PHOTO when hosted (http);
  data: URLs are skipped.
- Networks: Matrix, Keybase and Threads were actually new — Signal,
  Telegram, Mastodon and BlueSky already existed from the personal pack,
  so the subagent appended only the three and aligned the Telegram/BlueSky
  glyphs with the quick-add chips. detectNetwork gains the new domains.
- Verification: subagent harness 57 semantic + 44 byte-identity checks
  (default renders/vCards/plain text sha256-identical); full E2E 57/57
  twice locally; CI green on the tag. Test-side fixes: PGP truncation is
  20 chars (contract was ≤24); the vCard 3.0 PHOTO line folds at 75 chars
  so the test unfolds before asserting; the photo URL in tests is a real
  gravatar so the preview iframe makes no failed-request noise.

---

# v0.19.0 addendum (vCard NICKNAME / TZ / LANG / BDAY / UID / REV)

Date: 2026-11-19 · Scope: vCard completeness properties + editor fields.

## Notes

- NICKNAME from the preferred name, omitted when it equals the full name's
  first word; TZ/LANG/BDAY emitted only when set (raw values); new
  birthday (date) and timezone fields in the Profile section.
- Stable UID: deterministic urn:uuid (djb2 over lowercased email, else
  full name) in both cards — re-importing an updated vCard updates the
  existing contact instead of duplicating it. REV: ISO timestamp.
- Subagent harness 69/69 incl. byte-delta proof (cards minus the new
  property lines are byte-identical to pre-edit captures) and signature
  render byte-identity. Full E2E 58/58 twice locally; CI green on the tag.
- Note: sample personas replace the whole profile object and therefore
  don't carry birthday/timezone — builders skip unset values.

---

# v0.20.0 addendum (secondary email + custom contact labels)

Date: 2026-11-19 · Scope: second email address and per-field labels flowing
through signature, plain text and vCards.

## Notes

- contact.email2 renders in every layout's contact stack (href mailto:),
  the plain-text export and as a second EMAIL;TYPE=INTERNET in both vCards;
  showEmail governs both email items together.
- Per-field labels: emailLabel/email2Label/phoneLabel/mobileLabel/
  addressLabel with the existing defaults as fallbacks; the address stays
  label-less unless a label is set (byte-identical default).
- Subagent harness 48/48 incl. sha256-identical defaults across all 5
  personas, hostile-label escaping and the compact-layout email2 filter.
  Full E2E 60/60 twice locally; CI green on the tag.

---

# v0.21.0 addendum (tagline, alt text, photo shape, name weight)

Date: 2026-11-19 · Scope: identity polish fields.

## Notes

- Company tagline renders as a muted line under the company in every
  layout that shows it (hidden with showCompany; excluded from the Line
  template which has no company); flows into the plain-text export.
- logoAlt/bannerAlt replace the hardcoded 'logo'/'banner' alt attributes.
- photoShape (square/rounded/circle) supersedes the roundPhoto toggle; the
  Roundel's avatar stays a circle by design; strict mode strips circle and
  rounded radii. Legacy saves with roundPhoto:true are migrated to
  photoShape:'circle' on load.
- nameWeight (bold/semibold/normal) drives the name in classic and the
  duotone/photocard name spans.
- Subagent: 28/28 byte-identity + 34/34 feature checks; caught a global
  name collision with the parent's app.js helper (renamed theirs). E2E
  64/64 twice locally; CI green on the tag.

---

# v0.22.0 addendum (clickable banner + signature width)

Date: 2026-11-19 · Scope: banner campaign links and configurable width.

## Notes

- bannerLink wraps the banner image in a styled anchor in both Banner and
  Split layouts; bare domains get https://; empty link = byte-identical
  unwrapped output. Security: only http/https/mailto/tel hrefs are emitted
  — a javascript: value renders the banner unlinked instead.
- signatureWidth (400–600, default 600) drives the inner table's width
  attribute and max-width style; out-of-range/invalid values clamp.
- Subagent harness 143/143 incl. 20 sha256-identical baseline renders and
  all 14 E2E template markers. Full E2E 66/66 twice locally; CI green on
  the tag.

---

# v0.23.0 addendum (payment networks)

Date: 2026-11-19 · Scope: tip/payment links for creators and freelancers.

## Notes

- Five networks added to NETWORKS: PayPal, Venmo, Cash App, Revolut,
  Monzo (with prefixes and placeholders) + SOCIAL_HOST_PATTERNS entries so
  HTML import guesses them. Done in-parent (no subagent — single-file
  change).
- E2E: payment networks present in the picker and the PayPal chip renders
  with its normalized URL. 67/67 twice locally; CI green on the tag.

---

# v0.24.0 addendum (Enterprise template + organisational fields)

Date: 2026-11-19 · Scope: a template able to hold an organisational
signature: support module, recognise link, purpose, land acknowledgement,
brand footer. Built from a user-provided signature's STRUCTURE only — no
real data, icons or personal details were used anywhere.

## Notes

- 22 new optional fields: profile.team; design.supportTitle/
  supportChatUrl/supportChatLabel/supportButtonLabel/supportTagline/
  supportPhoneLocal/supportPhoneIntl/supportAltText; recogniseText/
  recogniseUrl/recogniseLabel; purposeText; landAcknowledgement +
  showAcknowledgement; footerLeft/Center/Right × Img/Text.
- enterpriseRows renders each section only when its fields are set
  (empty render = identity + contact), in a fixed order; support box uses
  its own tint (#f2f4f7) and strict-mode-aware radius; the footer is a
  nested 3-cell table (width="33%", Outlook-safe); land acknowledgement is
  small + muted, deliberately non-italic (italic is the Quote template's
  exclusive marker).
- Subagent harness 20/20: sha256 byte-identity for all prior templates,
  section ordering per the E2E, hostile-input escaping, marker
  exclusivity, strictOutlook, plus a 16-variant matrix. E2E 70/70 twice
  locally; CI green on the tag.

---

# v0.28.0 addendum (photo re-crop)

Date: 2026-11-19 · Scope: re-cropping an uploaded photo.

## Notes

- Re-crop button beside the logo upload: centre/left/right square crop
  from the original (kept in memory for the session only — originals are
  never persisted; after a reload a fresh upload enables it again).
  Pixel-verified E2E (200×100 red/blue image → left crop corner red).

---

# v0.29.0 addendum (i18n)

Date: 2026-11-19 · Scope: dependency-free internationalisation layer.

## Notes

- t(key, params) + data-i18n / data-i18n-html / data-i18n-title /
  data-i18n-aria extraction across the whole editor UI; 435 keys in
  en/de/es/fr (Sie/usted/vous register), key-fallback so nothing can
  render empty; template names translate, placeholders/compose mock/
  proper nouns stay English by design.
- Auto-detect from navigator.language, topbar switcher, persisted choice,
  html[lang] synced; onLangChange re-renders toasts, checklist,
  conciseness, wizard (only when open).
- English default byte-equivalent to pre-edit DOM (verified) — all 81
  prior tests unchanged; 5 new i18n tests (defaults, de switch +
  persistence, back to en, non-empty audit, de-DE auto-detect).
- sw.js precaches the new files, VERSION bumped.
- One pre-existing environmental flake (sw.js ERR_EMPTY_RESPONSE under
  full parallel load) reproduced on pristine v0.28.0 — unrelated.

---

# v0.34.0–v0.36.0 addendum (UI/UX/performance pass)

Date: 2026-11-19 · Scope: editor performance, touch-safe interaction,
scroll containment, copy + contrast audit.

## Notes

- Performance: preview renders coalesced to one rAF per frame (a
  30-key burst measured 70ms → 0ms synchronous work); template
  thumbnails skip while the Design section is closed and throttle to
  400ms with a trailing re-run when open, rebuilding on reopen; the
  inline QR cell-table is cached per (vCard, size). E2E covers the
  reopen-rebuild path.
- UI: all 15 hover rules gated behind @media (hover: hover) so touch
  devices never latch hover states; buttons scale 0.96 on press;
  export menu capped at 60vh with scroll; modals, saved panel and
  audit list get max-height + overscroll containment — verified on a
  390×560 emulated phone.
- Writing: no actionable findings — casing consistent (sentence-case
  topbar, title-case labels), toggles describe the ON state, no
  'successfully'/'Please'/'Click here'/error exclamations anywhere in
  the 481-key English master.
- Accessibility re-verified: focus trap + Escape cover every overlay
  (incl. the four newest modals), reduced-motion blanket intact,
  measured contrast worst case 6.5:1 (micro text), 320px layout has
  no horizontal overflow.

---

# v0.37.0–v0.38.0 addendum (vCard import, shortcuts, update pill)

Date: 2026-11-19 · Scope: import parity, keyboard power, SW updates,
thumbnail scheduling, narrow-screen topbar.

## Notes

- vCard import: HTML/VCard mode switch in the import modal, paste or
  .vcf file; RFC 2426/6350 line folding, FN/N with honorifics, work-
  preferred email, cell phone detection, TITLE/ORG/URL/ADR/BDAY/LANG,
  PRONOUN, KEY;TYPE=PGP; PHOTO noted and skipped; merge-only apply.
- Keyboard: Ctrl+Enter copies through the Outlook gate; Ctrl+Shift+E
  toggles the export menu; shortcut hints in menu titles.
- Thumbnails render on idle (requestIdleCallback, 1.2s timeout, hidden
  tabs defer) instead of a 400ms cadence — continuous typing no longer
  pays for 17 iframe parses at all; E2E asserts settle-on-pause.
- SW update pill: sw.js already skipWaiting+claims; a controllerchange
  on a session that HAD a controller now shows an "Update available /
  Reload now" pill (role=status). E2E drives showUpdatePill directly.
- Topbar compacts under 480px (smaller controls, brand text hidden);
  no horizontal overflow at 320px, everything reachable.

---

# v0.39.0–v0.41.0 addendum (customisation depth)

Date: 2026-11-19 · Scope: fonts, advanced colours, palettes, fine-tuning
overrides, the Custom block-reorder template.

## Notes

- Email-safe fonts: 8 new presets (Arial, Calibri, Georgia, Verdana,
  Trebuchet MS, Tahoma, Times New Roman, Segoe UI) + a custom stack
  override sanitised to font-safe characters (quotes/parens/semicolons
  stripped — E2E proves url() injection dies).
- Colours: link (company link), name and muted-text overrides,
  hex-validated with silent fallback; empty = byte-identical defaults.
- Fine-tuning: section gap, cell padding, social chip gap, line-height
  multiplier (1.0–2.0), global text alignment, card padding (8–40px)
  and card border width (0–4px). All overrides are '' = follow the
  density preset, so every prior render stays byte-identical.
- Custom template (18 total): 8 reorderable blocks built entirely from
  the shared helpers — identity (logo top + name stack), divider,
  contact, socials, banner, footer, QR, custom HTML. Drag-and-drop plus
  arrow buttons, order persisted in state (undo-able, autosaved);
  empty blocks collapse. E2E covers default order, reorder, reload
  persistence and empty-block collapse.

---

# v0.44.0 addendum (welcome pass)

Date: 2026-11-19 · Scope: first-session approachability.

## Notes

- Essentials-first: a genuine first visit opens only Profile + Design;
  the section map is written only on real user toggles (a WeakSet guard
  skips the async toggle events the programmatic collapse fires).
- Empty-state guide: a callout over the preview until a name exists;
  CTA opens Profile and focuses the name field.
- Trust badge: recomputed from buildAudit on every checklist pass —
  green 'Outlook-safe' or amber 'N things to fix'; click focuses the
  checklist.
- Pointer tour: 4 spotlight steps after the wizard (preview, name,
  export, checklist), Esc/Skip/finish sets sigstudio.tour.done, focus
  managed, resize-aware. A draft with CONTENT marks a returning user —
  a bare default draft flushed by a mid-wizard reload does not (found
  and fixed during parent verification: the unload-flush wrote an
  empty draft, which the original trigger counted as a returning user,
  silently killing the tour after any reload; E2E covers the case).
- e2e/helper.js seeds all sections open + tour done so the 117
  pre-existing tests run as returning users; welcome.spec adds 7 tests
  (first-visit collapse, guide, badge, tour walkthrough/skip/Esc,
  reload-flush tour). 124/124 twice locally.

---

# v0.45.0 addendum (Simple / Advanced mode)

Date: 2026-11-19 · Scope: progressive disclosure of expert controls.

## Notes

- A topbar Simple|Advanced toggle. Simple hides every [data-advanced]
  control via CSS (.mode-simple [data-advanced] { display:none }):
  the org + custom-lines sections, fine-tuning, advanced colours,
  custom font/HTML, QR controls and the export menu's Power tools
  group. State is never touched — switching restores everything.
- Boot default: stored preference wins; otherwise a draft containing
  advanced content keeps the user in Advanced, everyone else starts
  Simple. e2e/helper.js seeds 'advanced' so all existing specs run as
  power users; mode.spec (3 tests) covers the fresh-visitor default,
  reveal-and-preserve, and reload persistence.

---

# v0.47.0 addendum (dark-mode fixes on light surfaces)

Date: 2026-11-19 · Scope: support module + card wrapper under
Dark Mode Friendly.

## Notes

- Bug (user-reported, screenshots): the Organisation > Support Module
  title rendered white-on-white with Dark Mode Friendly on — the box
  keeps its light #f2f4f7 tint in dark clients while the dm stylesheet
  forced #e9ecf2 on the title's dm-txt class. Fix: support-box content
  carries no dm-* classes; inline colours stay dark on the light box.
- Same root cause fixed for the card wrapper: it also stays light, so
  darkStyleBlock now emits td[data-card="1"] scoped overrides resolving
  dm classes back to dark readable colours when showCard is on.
- Verified live under emulated prefers-color-scheme: dark — title
  computed rgb(58,63,71) (~8:1) on rgb(242,244,247). Default renders
  byte-identical (dmCls returns '' when the flag is off).
- 3 new E2E tests in dm-fix.spec; suite 131/131 twice locally.

---

# v0.48.0 addendum (CID image mode)

Date: 2026-11-19 · Scope: inline Content-ID image references for
mail-pipeline deployments, with the bulk manifest.

## Notes

- design.imageMode: '' (normal — hosted URLs and base64 data URIs
  behave exactly as before) | 'cid'. In CID mode every image is
  emitted as cid:sigstudio-<key> — logo, banner, footer-left/-center/
  -right, social-<network> — while the stored value remains the
  asset's source of truth (switching back restores it byte-exactly).
- Verified against a real corporate .eml supplied by the user: CBA's
  pipeline attaches six PNGs as Content-Disposition:inline parts with
  per-message UUID Content-IDs. The mode mirrors that pattern for
  programmatic deployments.
- Bulk generator: in CID mode the ZIP also carries manifest.json
  (version 1, cid → file/url + mime) plus decoded image files for
  data-URI assets (hosted URLs listed by reference); zipStore accepts
  binary Uint8Array payloads (PNG magic verified in the E2E).
- Checklist warns that hand-pasted CID signatures show broken images.
- e2e/helper.js allowlists the preview's expected
  ERR_UNKNOWN_URL_SCHEME noise for cid: refs. 3 new tests in
  cid-mode.spec; suite 134/134 twice locally.

---

# v0.49.0 addendum (export image optimisation + audit strategy advice)

Date: 2026-11-19 · Scope: per-message weight for CID deployments.

## Notes

- bulkAssetsAsync replaces the synchronous manifest step: data-URI
  assets are decoded, downscaled to their display slot (logo width,
  600px banner, 96px footer, chip-size socials) and re-encoded —
  JPEG 0.85 when fully opaque, PNG when any pixel is transparent.
  The optimiser keeps the RAW payload when re-encoding would be
  bigger (tiny or solid-colour PNGs compress better than JPEG).
- Manifest entries gain width/height/optimized.
- Audit: CID mode gets an info line naming the manifest/pipeline;
  normal-mode data-URI images get an info line pointing at hosting
  or CID.
- E2E: noise-image test proves 512px→72px JPEG conversion and ZIP
  shrinkage; transparent-image test pins PNG retention; audit test
  covers both advisories. Suite 137/137 twice locally.

---

# v0.50.0 addendum (footer version, per-image controls, socials position)

Date: 2026-11-20 · Scope: the three requests from user QA.

## Notes

- App footer shows "Signature Studio vX.Y.Z" from APP_VERSION in
  app.js, which the release loop keeps in sync with package.json and
  sw.js (CI check job now fails the build on drift).
- Image reference mode moved from one global select to a per-image
  select beside every image field: logo, banner, brand-footer ×3
  (which also gained Upload buttons) and one for all social icons.
  design.imageRef.<key> overrides win over the legacy global
  design.imageMode, which is migrated into per-image values on load
  (v0.48 saves keep working). cidImagesActive(state.design) gates the
  checklist warning, the audit advice and the bulk manifest.
- Socials position "Under the name": honoured on every template.
  Fixed the reported bug on Enterprise (emitted after the footer)
  and the same defect on Letterhead; added it to Roundel, Masthead,
  Monogram, Photocard, Postcard, Duotone, Quote and Line (line keeps
  chips on their own row under the single line). Custom keeps its
  block order.
- E2E: version-footer match against package.json; footer upload
  buttons + per-image CID on brand footer; underName ordering across
  templates + bottom restoration. Suite 140/140 twice locally.

---

# v0.51.0 addendum (single-signature CID ZIP export)

Date: 2026-11-20 · Scope: the pipeline package without the CSV flow.

## Notes

- New export-menu item "Signature + images (ZIP)…" (Power tools):
  renders the current signature and packages it exactly like the
  bulk generator does — <slug>-signature.html, images/ assets,
  manifest.json — via the shared singleCidPackage() in bulk.js.
- With no image set to Inline CID it downloads nothing and toasts
  guidance (the package only exists because of the cid refs).
- Success toast is neutral (no .toast.ok style exists).
- Audit advisory reworded: "the ZIP exports" (plural) now covers
  both flows. 3 new i18n keys ×4 (560 each).
- E2E: toast-then-download flow, ZIP contents (html with cid src,
  manifest, PNG part). Suite 141/141 twice locally.

---

# v0.52.0 addendum (sidebar scroll layout fix)

Date: 2026-11-20 · Scope: sidebar clipping reported by the user
(screenshot: editor content cut at the fold, page-level scrollbar).

## Notes

- Cause: the layout relied on height:calc(100vh - 52px) with the
  editor overflow-y:auto — fragile across engines, and the version
  footer added a permanent ~60px page scroll. Replaced with a
  definite-height flex column: body {display:flex; flex-direction:
  column; height:100vh}, .layout {flex:1 1 auto; min-height:0;
  overflow:hidden; grid-template-rows:minmax(0,1fr)}, editor/
  preview-col {min-height:0}. min-height:100vh alone does NOT shrink
  the app row (body grows to content — measured: layout 6559px);
  the explicit 1fr grid row is required because an auto row sizes to
  the content regardless of the item's min-height:0.
- Narrow widths (<=980px) revert to single-column with the page
  scrolling as a whole (flex:none; height:auto on .layout).
- Regression guard: e2e/layout.spec.js pins editor-scrollable +
  bodyScrollH == viewport on desktop, and page-scroll at 760px.
- Two CSS patch hazards recorded: an anchored insert severed the
  html,body rule (orphaned declarations made the parser swallow the
  .hidden rule — the visible scrim blocked every click) and the
  flex/grid shrinking rules above. Suite 143/143 twice locally.

---

# v0.53.0 addendum (AI-built disclosure)

Date: 2026-11-20 · Scope: transparency, mirroring Roost.

## Notes

- README: Roost-style [!IMPORTANT] blockquote at the very top —
  AI-generated code/docs/packaging with human direction and testing,
  review before sensitive use, no implied warranty.
- App footer: second line under the version ("Built largely with AI
  assistance — human-directed and tested."), key footer.aiDisclosure
  in all four locales (561 each), styled as a dimmer sub-line.
  v0.54.0 shortened the wording to "Built largely with AI assistance."

---

# v0.55.0 addendum (pronouns position)

Date: 2026-11-21 · Scope: pronouns under the name, requested.

## Notes

- design.pronounsPosition: '' (default — inline after the name,
  byte-identical: name + space + "(pronouns)" at fs-3) | 'underName'
  (own line via <br>, fs-4 — one step smaller still).
- Both name renderers honour it: nameHtml and night's dedicated
  lightStyle name line. Letterhead/quote/etc. inherit via nameHtml.
- UI: "Pronouns position" radios next to Socials position in Design.
- 4 new i18n keys ×4 locales (565 each).
- E2E: inline default byte-shape, underName placement + exact 4px
  delta, switch-back, night variant. Suite 146/146 twice locally.

---

# v0.56.0 addendum (Design section right column clipped)

Date: 2026-11-21 · Scope: controls cut off at the sidebar's right edge
(Divider Length, Font, Custom font stack, Line height, footer selects…).

## Notes

- Measured: the Design .grid2 overflowed by 115px at a 1280px window —
  plain 1fr tracks take their content's min-content width, and one
  select (long "As stored — URL or uploaded image" option) had a
  269px min-content; details{overflow:hidden} then clipped the right
  column with no scrollbar.
- Fix: .grid2 → repeat(2, minmax(0, 1fr)) with min-width:0 on cells;
  field inputs/selects min-width:0; .range-row wraps with min-width:0
  (the name letter-spacing row was the last 15px).
- Regression guard: layout.spec now asserts zero horizontal overflow
  across EVERY section's grid2/fields at 1280px. Suite 147/147 twice.

---

# v0.57.0 addendum (progressive settings restructure)

Date: 2026-11-21 · Scope: proposal C — section order, placement, and
conditional visibility.

## Notes

- Ten sections in signature order: tpl, profile (renamed Identity),
  logo, contact, socials, org, type, blocks, adv, elements. The old
  64-field Design section is split into Template & layout, Logo & photo,
  Colours & type (nested Colours / Typography / Spacing / Divider) and
  Advanced (collapsed: custom HTML, signature name).
- All socials controls (style, icon size, chip gap, position, icon
  image mode) moved into Social links ▸ Style & position.
- Blocks absorbs status badge, QR, quote, legal line and custom lines;
  Show/hide gains the contact-labels toggle.
- Conditional visibility (applyFieldVisibility in app.js): data-when
  (space-separated = AND) + data-when-fill, specials @socials/@pronouns/
  @status. Hidden: QR size without QR, divider controls without the
  divider, card padding without the card, label fields without labels,
  contact fields whose Show/hide toggle is off, socials styling with no
  socials, status colour without badge text, pronouns position without
  pronouns, image-use selects with an empty image field.
- First visit now opens Template & layout + Identity; thumbnails gate
  on the tpl section; helpers gained openSection/openSub. Suite
  152/152 twice locally.

---

# v0.58.0 addendum (settings search + preview linking)

Date: 2026-11-21 · Scope: recommendations 1 and 2 from the usability pass.

## Notes

- Search: sticky input above the sections; matches control text and
  section/sub-group headings; non-matching controls (.filtered-out) and
  empty sections hide; matching sub-groups auto-open; while searching,
  data-when hides are suspended so a match is never a phantom result;
  Ctrl/Cmd+K focuses, Esc clears. Nested controls (range rows) are
  governed by their owning field — otherwise the slider vanished while
  its label stayed.
- Preview linking: templates emit data-edit marks (name, pronouns,
  title, company, tagline, location, status, legal, divider, logo,
  banner, socials, footer, contact:<key>) only in the preview render;
  renderSignature/renderFragment strip them so exports stay clean. The
  preview iframe posts {__sigstudio:'edit'} on click; the editor opens
  the containing section/sub-group, scrolls the control into view and
  flashes it. Hidden controls fall back to the section header.
- 2 new i18n keys x4 (579 each). Suite 157/157 twice locally.

---

# v0.59.0 addendum (dimming, eyes, section reset)

Date: 2026-11-21 · Scope: usability batch 3, 4 and 6.

## Notes

- Template dimming: data-used-by lists on template-specific controls;
  off-template controls keep working but dim (opacity .45) with a
  dashed "Only in {names}" chip using translated template names.
  Covers banner fields, quote, QR (classic+enterprise), support module
  (enterprise), logo position and photo shape.
- Inline eyes: 10 identity/contact fields carry an eye button that
  toggles their show/hide state — the field dims and strikes through
  instead of disappearing (reversible), the Show/hide checkbox mirrors
  it, and the two stay in sync both ways. The primary fields no longer
  use data-when (their label rows still do).
- Per-section reset: whitelist per section (tpl, logo, socials, type,
  blocks, elements) — resets design settings to defaults, never content
  (names, contacts, legal text, support copy, images). Toast on reset;
  the summary click never toggles the section.
- Fixed a one-shot srcdoc race in divider-night.spec exposed by the
  added render work. Suite 162/162 twice locally.

---

# v0.60.0 addendum (adversarial-pass fixes)

Date: 2026-11-21 · Scope: RED R1/R2, corrected R3, two P2s.

## Notes

- **R1 copy stall:** navigator.clipboard.write can stay pending forever
  (WebKitGTK; Chromium after an OS file dialog steals focus), leaving
  Copy silently dead. copySignature now races a 1500ms timeout, falls to
  execCommand, then the manual-copy modal + toast. Test stalls the
  clipboard, forces execCommand false, and proves the modal opens.
- **R2 image URLs:** absoluteImgUrl() prefixes https:// on scheme-less
  values (mail clients cannot resolve relative srcs); data:/cid:/blob:
  pass through. The audit flags values that are not web addresses
  (local paths, spaces) with audit.imgBadUrl ×4 locales.
- **R3 correction:** the filed "wizard/tour fire mid-task" was a FALSE
  POSITIVE caused by using offsetParent (always null on position:fixed
  overlays). Re-measured with computed display: the wizard opens at load
  (~1.3s), as designed. The genuine residue — the tour landing on a
  blank preview immediately after the wizard — is fixed: the tour arms
  on wizard skip and starts on the first field edit; the spotlight
  repositions on a 300ms interval so reflow can't desync it; focus
  returns to the field the user was editing.
- **First visit** now opens Identity only (Template & layout starts
  collapsed).
- **Labels** 11px → 12px (field labels only; micro help text unchanged).
- Note for future adversarial runs: measure overlays with
  getComputedStyle, never offsetParent. Suite 166/166 twice locally.

---

# v0.61.0 addendum (actionable guidance)

Date: 2026-11-21 · Scope: checklist jumps + copy inside instructions.

## Notes

- collectWarnings() now attaches a target to every warning (data-field
  path or @section:id); checklist items render as <button> elements with
  data-check-target and focusField() (shared with preview-click linking)
  opens the section/sub-group, scrolls and flashes the control.
- Instructions modal gained a "Copy signature" primary action above the
  tabs — one place to read the steps and grab the signature. Every
  client pane's first step now points at that button. Menu item renamed
  "How to add it to Outlook, Gmail…".
- Incident: the patch that added the #instr-copy binding fuzzy-matched
  the neighbouring line and deleted the #x-json handler (JSON editor
  dead). Caught by share-json.spec; binding restored. Recorded in the
  skill: always diff after patches near sibling one-liners.
- 2 new i18n keys + 6 rewritten step-1 strings ×4 (584 each). 4 new E2E
  tests. Suite 170/170 twice locally.

---

# v0.62.0 addendum (Simple-mode sweep, plainer labels, more eyes)

Date: 2026-11-21 · Scope: jargon out of Simple mode; visibility parity.

## Notes

- Simple mode (data-advanced) now also hides Apple Mail (.mailsignature),
  Thunderbird, vCard and vCard 4.0 downloads and the Import HTML button.
- Labels: "Density" → "Spacing preset"; "Signature width" → "Width";
  "Base font size (px)" → "Text size (px)"; fine-tuning hint → "Custom
  spacing — empty follows the preset" (×4 locales).
- Eyes added to team, tagline, status badge and the Social links summary
  (the summary eye toggles showSocials without collapsing the section —
  the eye handler stops propagation). Show/hide gains Team and Tagline
  switches; showTeam/showTagline default true; tagline now honours its
  own toggle (previously only company's).
- The team line only renders in Enterprise, so its field carries
  data-used-by="enterprise" dimming.
- 2 new i18n keys (586 each); 4 new E2E tests; two spec corrections
  (Ada has no tagline; the enterprise dim locator is now scoped).
  Suite 174/174 twice locally.

---

# v0.63.0 addendum (narrow-window preview peek)

Date: 2026-11-21 · Scope: editing below 980px without losing sight of the
signature.

## Notes

- A floating Preview pill appears at ≤980px; it opens a bottom sheet with
  a mirrored live preview (same srcdoc as the main frame, refreshed on
  every render while open). Close button and Escape dismiss it;
  aria-expanded tracks state and focus returns to the pill.
- Desktop unchanged: the pill and sheet are hidden above 980px.
- 3 new i18n keys ×4 (589 each). 2 new E2E tests (narrow open/mirror/
  stream/close; desktop hidden). Suite 176/176 twice locally.

---

# v0.64.0 addendum (optimised uploads, example CTA)

Date: 2026-11-21 · Scope: the 512 KB wall removed by shrinking instead of
refusing; cold-start example.

## Notes

- bindImageUpload now accepts up to 8 MB (the read limit, not a product
  limit), then optimises: uploadTargetWidth = 2× display (logo width ×2,
  600 banner, 192 footer), optimizeImage() re-encodes JPEG/PNG and keeps
  the smaller; bytes are rebuilt into a data URL in 32 KB chunks. The
  square-crop path runs first and the pre-optimise original is kept for
  re-crop quality.
- Toast reports the saving ("Image optimised — 2.4 MB → 86 KB"); images
  that do not shrink fall back to the embedded-image warning. The 8 MB
  refusal keeps its own message.
- Empty state gains "Or start from an example" → loads the first sample
  persona (already undoable via pushHistory).
- 2 new i18n keys + rewritten size message ×4 (591 each). 3 new E2E
  tests (downscale, refusal, example CTA). Suite 179/179 twice.

---

# v0.65.0 addendum (axe audit + visual baselines)

Date: 2026-11-21 · Scope: measured accessibility; layout drift insurance.

## axe findings and fixes

- **nested-interactive (6)** — reset buttons and the socials eye lived in
  `<summary>`. Moved to a `.sec-tools` row at the top of each section body
  (with a small "Reset" label). Sections affected: Templates, Logo,
  Social links, Colours & type, Blocks, Show / hide.
- **select-name (critical, 5)** — logo position, the per-row network
  select and the socials image-use select had no accessible name;
  `aria-label` added (network select in app.js socials row renderer).
- **label (critical, 5)** — six range inputs (width, logo size, social
  icon size, name spacing, name size, QR) were named only by adjacent
  text. `aria-label` added; `#stage` is now `tabindex="0"` with
  `role="region"` and an aria-label (fixes scrollable-region-focusable).
- **color-contrast (3)** — active mode toggle (white on --acc ≈ 3.3:1) now
  uses a 72% accent mix; `.compose-sig-note` light/dark greys swapped
  (light #5d6675, dark #8a93a3); the AI footer disclosure's opacity was
  removed.
- Result: 0 serious/critical violations across the editor, export menu,
  instructions and audit modals. 2 axe tests added to a11y.spec.js
  (7 total there).

## Visual baselines

- e2e/visual.spec.js screenshots `.compose-sig` for all 18 templates plus
  the editor chrome, with animations/carets disabled and a light stage.
  Baselines (19 PNGs, 696 KB) committed; `maxDiffPixelRatio: 0.002`.
  **Skipped on CI** — font rasterisation differs between machines, so the
  guard is local-only rather than a false-red gate. Regenerate with
  `--update-snapshots` after an intentional design change.
- Suite 183/183 twice locally.

---

# v0.66.0 addendum (undo coverage)

Date: 2026-11-21 · Scope: every destructive edit is reversible.

## Audit

| Action | History before | Now |
| --- | --- | --- |
| Load sample persona | yes | yes |
| Wizard finish | yes | yes |
| Start over (confirm) | yes | yes |
| Import (vCard / HTML) apply | yes | yes |
| Preset import | yes | yes |
| Saved-snapshot load | yes | yes |
| **Section reset** | **no** | **yes** |
| **JSON editor apply** | **no** | **yes** |

- `resetSection()` and `applyJsonEditor()` now call `pushHistory()` before
  mutating, so ↶ restores the pre-reset values and the previous document.
- 2 new E2E tests (reset → undo restores logoWidth; JSON apply → undo
  restores the name). The JSON test also caught that the textarea is
  `#json-text`, not `#json-src`. Suite 185/185 twice locally.

---

# v0.66.1 addendum (CI harness fix)

Date: 2026-11-21 · Scope: the workflow's static smoke test, not the app.

- v0.63.0–v0.66.0 tag runs all failed in the `check` job at the smoke
  step with exit code 23 and no output (v0.62.0 was the last green). Cause: `curl -sf URL | grep -q
  'Signature Studio'` runs under bash `-o pipefail`; `grep -q` exits
  after the first match, so once `index.html` grew past the 64 KB pipe
  buffer (now 87,719 B) curl is still writing and dies with EPIPE (23),
  which pipefail then propagates. The step passed for dozens of releases
  only because the file used to fit in one pipe write.
- Fixed by downloading to `/tmp/index.html` and grepping the file — size
  independent. Released as v0.66.1 so the fix is inside a tag's own tree;
  v0.64–v0.66 remain valid releases whose CI failure was the harness.

---

# v0.66.2 addendum (QA audit — i18n regression)

Date: 2026-11-21 · Scope: a regression from v0.65 found by the adversarial
audit, plus the guard that would have caught it.

- `.sec-tools-label` shipped with `data-i18n="reset.short"` but no such key
  existed in any locale, so every section header rendered the literal
  string "reset.short". Added ×4 (Reset / Zurücksetzen / Restablecer /
  Réinitialiser), 592 keys each.
- New spec `e2e/i18n-keys.spec.js` (4 tests, one per locale): opens every
  section, then fails if any `[data-i18n]` element or i18n-bound
  title/placeholder/aria attribute renders text shaped like a key
  (`lowerCamel.dotted.path`). This class of bug is invisible to axe and to
  per-feature specs — the string is valid text, just the wrong text.
- Suite 189/189 twice locally. The full audit report (18 findings across
  security, data-loss, import quality and a11y) is separate from the repo.

---

# v0.67.0 addendum (audit batch 1 — security & share safety)

Date: 2026-11-21 · Scope: S1 (stored XSS) and S2 (silent draft replacement)
from the adversarial audit, plus the message-listener hardening (O9).

## S1 — executable markup

- New `sanitiseHtmlFragment()` / `sanitiseDocumentHtml()` (DOMParser based)
  strip `script, iframe, object, embed, base, meta[http-equiv],
  link[rel=import]`, every `on*=` attribute, `javascript:` / `vbscript:` /
  `data:text/html` URLs in href/src/action, and CSS `expression()` /
  `url(javascript:)`.
- Applied twice: `normalizeLoadedState()` cleans `design.customHtml` and
  social URLs (so drafts, JSON imports, presets, snapshots and `?sig=`
  links all arrive clean), and `renderPreviewNow()` sanitises the whole
  preview document before the click reporter is injected — so even state
  mutated at runtime cannot execute.
- Proof: `onerror`/`<script>` payloads no longer fire (parent flags stay
  0) via the Custom HTML block, a `?sig=` link, or JSON apply; the preview
  still carries `data-edit` and click-to-edit still flashes the field.

## S2 — shared links no longer clobber open work

- `?sig=` decodes into `sharedState` and is applied at end of init only
  after checking `draftHasContent(loadDraft())`. With work open it shows a
  confirm ("Open this shared signature? … press ↶ afterwards to get yours
  back"), pushes the local state onto history, and strips the parameter
  via `history.replaceState` so a reload does not re-ask. Without a draft
  it loads directly (and still reports "Shared signature loaded.").
- The share round-trip spec now opens the link in a **separate browser
  context**, matching a different person opening it.

5 new E2E tests (security.spec.js). Suite 194/194 twice; visual baselines
unchanged (sanitising does not alter the rendered pixels).

---

# v0.68.0 addendum (audit batch 2 — output safety)

Date: 2026-11-21 · Scope: S6 (schemes + validation) and S7 (long-token
overflow).

## Schemes

- `normalizeUrl()` now refuses every non-allow-listed scheme
  (`javascript:`, `vbscript:`, `data:`, …) while keeping host:port inputs
  working (`example.com:8080/x` → `https://example.com:8080/x`), and still
  prefixing bare hosts. Website and social links therefore produce no href
  rather than a live `javascript:` link.

## Validation

- `collectWarnings()` gains three format checks (incomplete email, phone
  shorter than 6 digits, website that is not a web address) plus a
  long-token hint. All four carry `target`s, so they appear as buttons in
  the checklist and jump to the offending field — no new plumbing.

## Overflow

- `textStyle()` adds `word-wrap:break-word` (harmless where unsupported)
  and a new `softBreak()` inserts `<wbr>` every 40 characters inside an
  unbroken token for name, company, title and every contact line. Measured
  before/after on the audit fixture (`ACME_` + 140 chars, 160-char URL):
  971 px overflow → under 10 px.

4 i18n keys ×4 (598 each). 3 new E2E tests (output-safety.spec.js).
Suite 197/197 twice.

---

# v0.69.0 addendum (audit batch 3 — sharing, bulk, import)

Date: 2026-11-21 · Scope: S3, S4, S5 and S11.

## Bulk (S3)

- Filenames are now `slug(name)-<email-local>.html`, with a numeric suffix
  only if that still collides. Exact duplicate rows (`name|email`) are
  skipped and counted in `out.duplicates`; previously three people named
  "Zoey DiZio" produced three identical `zoey-dizio.html` entries and
  extractors silently kept one. bulk.spec updated to the new names.

## Share (S4)

- `doShareLink()` measures the URL; above 8 KB it copies anyway but warns
  with the real size ("… it is 209 KB because it includes images"). New
  menu item **Copy share link without images** strips `data:` sources from
  a clone, so the link stays a few KB and the recipient's own images are
  untouched.

## Import (S5)

- Phone-shaped lines are recognised with or without a label (`M:`, `Tel:`,
  `T:`, bare `+61 …`) and fill phone/mobile before the identity heuristic
  runs. The line classifier no longer mistakes a phone for the job title,
  and company-first signatures (`Name / Company / Role`) are handled.

## Types (S11)

- `normalizeLoadedState()` coerces by the default's type: profile/contact
  strings, design strings/numbers/booleans, `imageRef` sub-keys, and
  `customLines` keep their real `{ label, value }` shape. Malformed JSON
  can no longer render `[object Object]` or silently drop socials.

3 i18n keys + 1 topbar key ×4 (601 each). 4 new E2E tests
(sharing-batch.spec.js). Suite 201/201 twice.

---

# v0.70.0 addendum (audit batch 4 — polish)

Date: 2026-11-21 · Scope: S8, S9, S10, S12.

- **Autosave (S8)** is now a trailing debounce (700 ms), not a leading
  throttle: every edit resets the timer and the write always carries the
  latest state. The footer shows the outcome — Saved locally / Saving… /
  Not saved (storage full) — in a `role="status"` span, so failures are
  visible for as long as they last instead of a toast that scrolls away.
  `beforeunload` and `visibilitychange` still flush synchronously.
- **Toasts (S9)** collapse by `key`: the newest replaces the live one, so
  six failed saves read as one message.
- **Targets (S10)**: `.sec-reset` is 28×28 and range inputs are 28 px tall
  (WCAG 2.2 SC 2.5.8 asks 24×24).
- **Remote images (S12)**: a "Remote images" switch in the preview options
  filters `https?://` sources out of the preview AND the template
  thumbnails when off (the stored value is untouched, exports still carry
  the URL). Preference persists in `sigstudio.remoteImg`.
- Visual baselines regenerated for the two intentional chrome changes
  (footer status, preview options).
- 5 new E2E tests (polish-batch.spec.js); one pre-existing one-shot read in
  pronouns-position.spec converted to `expect.poll` (the rAF race the
  skill warns about). Suite 206/206 twice.

---

# v0.71.0 addendum (technical-adversary batch 1 — self-host correctness)

Date: 2026-11-21 · Scope: T1–T4 of the technical persona review.

## T1 — the image was a checkout

- `Dockerfile` now copies an allow-list (`index.html`, `sw.js`,
  `manifest.webmanifest`, `assets/`, `nginx.conf`) instead of `COPY .`;
  `.dockerignore` excludes `e2e/`, `docs/`, `tools/`, `tests/`,
  `test-results/`, `.forgejo/`, `node_modules/`, package files and markdown.
- `tools/check_selfhost.py` fails the build if `COPY .` returns, if a COPY
  source is missing/unexpected, if an ignore line disappears, or if the
  nginx CSP goes missing. Wired into the CI `check` job.
- Simulated image tree: 27 files / 900 KB, no dev directories.
  **Verified by manifest + simulation** — this environment has the Docker
  CLI but no daemon, so `docker build` itself was not run here; the guard
  makes the regression class impossible to reintroduce silently.

## T2 — share links that hosts will accept

- Above 8 KB the default now copies the image-free link and says why
  ("would be 209 KB, which many hosts refuse"). The menu item became
  **Copy share link with images** for the explicit full link, which keeps
  the size warning. Threshold rationale: nginx's default request line is
  8 KB; our dev server answered **414** at 64 KB.

## T3 — reachable shortcut

- Search moved to `/` (when not typing) and `Ctrl/Cmd+Shift+K`. Plain
  Ctrl/Cmd+K is untouched — it belongs to the address bar. Placeholder
  hint, README-adjacent copy and the search spec follow.

## T4 — CSP that ships and is tested

- `nginx.conf`: CSP (self + the two `'unsafe-inline'` tokens this app
  needs), `X-Frame-Options: DENY`, `Permissions-Policy`, plus 404s for
  `/e2e/`, `/docs/`, `/tools/`, `/tests/`, `/test-results/`, `/.forgejo/`
  and dotfiles.
- `e2e/selfhost.spec.js` reads `nginx.conf`, asserts the headers and deny
  regexes, then applies that exact CSP to a live page: zero violations,
  preview renders, click-to-edit still works.
- README gains a **Hardening** section explaining the two `'unsafe-inline'`
  tokens and what tightening them would require.

3 new E2E tests; suite 209/209 twice.

---

# v0.72.0 addendum (technical-adversary batch 2 — ops polish)

Date: 2026-11-21 · Scope: T5–T9.

- **T5 app archive**: `tools/make_app_zip.py` (`npm run pack:app`) writes
  `dist/signature-studio-<v>-app.zip` — index.html, sw.js,
  manifest.webmanifest, nginx.conf and assets/ at the zip root, 27 files /
  391 KB, no dev material. Every release now attaches it alongside the
  source archives; README Option C points at it.
- **T6 docs drift**: README no longer states a test count ("29 tests" had
  aged fourfold). Counts live in this report, which is written per release.
- **T7 noscript**: a styled notice explains that the app is client-only
  when scripting is disabled.
- **T8 storage**: Saved shows "3.2 MB of 5.0 MB used · 2 saved" with a
  colour-coded bar (70 % amber, 90 % red), per-snapshot sizes, and
  **Delete oldest**, which trims until 70 % but never removes the last
  snapshot. Measured fixtures: two photo-sized snapshots + filler = 76 %
  → cleanup leaves one. IndexedDB for image blobs is still the right
  long-term answer and remains an explicit follow-up — this release makes
  the ceiling visible and recoverable rather than silent.
- **T9 service worker**: `skipWaiting()` removed from install; the new
  worker waits, the pill appears from `registration.waiting` /
  `updatefound`, and accepting posts `SKIP_WAITING` (new message handler)
  before reloading, with a 1.5 s fallback. `activateWaiting()` is the
  testable seam; `e2e/selfhost-ops.spec.js` asserts the contract and the
  static absence of the old auto-promotion.

4 new E2E tests. Suite 213/213 twice.

---

# v0.73.0 addendum (accessibility batch 1 — form semantics)

Date: 2026-11-21 · Scope: A1, A2, A3, A5 from the accessibility review.

- **A1** — `autocomplete` tokens (name, nickname, organization,
  organization-title, address-level2, email, tel, url, street-address) and
  `type=tel/url` + `inputmode` on every identity/contact field. Two email
  inputs already had `type=email`.
- **A2** — inline validation: shared `validEmail/validPhone/validSite`
  helpers drive both the checklist and a `.field-error` note under the
  field, with `aria-invalid` + `aria-describedby`; cleared when fixed.
- **A3** — `#check-announce` (role=status) announces "N item(s) to review" /
  "Ready to export" without re-reading the list; "No settings match" and the
  Saved count are live too.
- **A5** — a visually hidden `<h1>` and ten section titles exposed as
  `role="heading" aria-level="2"`; the four summaries that carried
  `data-i18n` directly were normalised to the same inner-span shape.
- **Bonus, found by the new axe test**: `.tpl-dim` used `opacity:.45`,
  which took 12 px text to **2.27:1** — a real WCAG 1.4.3 failure that the
  earlier axe run missed because the dimmed fields sat outside its sample.
  Dimming is now a dashed outline + the existing "Only in …" chip; `.opt`
  and the saving state also lost their sub-1 opacity.
- 6 new E2E tests (a11y-forms.spec.js, including axe with an invalid field).
  Suite 219/219 twice.

---

# v0.74.0 addendum (accessibility batch 2 — modals & contrast)

Date: 2026-11-21 · Scope: A4, B1, B2.

- **A4** — `#saved-panel` is now `role="dialog" aria-modal="true"
  aria-labelledby="saved-title"` with a real Tab trap (25 forward + 5 back
  tabs stay inside) and Escape-to-close; focus returns to the Saved button.
  Deleting a snapshot re-focuses the same row's Load button instead of
  dropping to `<body>`. The preview sheet was claiming `role="dialog"`
  without modal behaviour, so it is now a labelled `region` that still
  closes on Escape.
- **B1** — `@media (forced-colors: active)` gives toasts, the save status,
  dim outlines, the storage bar and pills a `CanvasText` border, paints the
  toast on `Canvas`, and pins the status chip's colours with
  `forced-color-adjust: none` (colour carries meaning there).
- **B2** — thumbnails were a fixed `scale(0.13)`; at 320 px that overflowed
  a 63 px tile by 15 px. `fitThumbs()` now sets the scale from the tile's
  real width on render and on resize.
- 5 new E2E tests (modal-contrast.spec.js, including CDP forced-colours
  emulation and the 320 px fit check). Suite 224/224 twice.

---

# v0.75.0 addendum (accessibility batch 3 — team flow)

Date: 2026-11-21 · Scope: C1, C2.

- **C1** — `bulkPlan()` classifies each CSV row before anything is built
  (ready / noName / noEmail / duplicate) and assigns the final filename;
  `bulkGenerate()` now consumes the plan, so what the preview shows is exactly
  what the ZIP contains. The modal renders a sticky-header table of the first
  25 rows with status in the last column, updating 200 ms after typing.
  Delimiter sniffing accepts `,` `;` and tab; a leading BOM is stripped.
- **C2** — HTML paste-import now lists every recovered field as a checked
  chip (name, title, department, company, email, phone, mobile, website,
  logo, legal line, socials). Apply merges only the checked ones; the chips
  reset on every new Parse.
- 4 new E2E tests (team-flow.spec.js) plus the existing bulk/sharing specs.
  Suite 228/228 twice.

---

# v0.76.0 addendum (accessibility batch 4 — sharing & shortcuts)

Date: 2026-11-21 · Scope: C3–C7.

- **C3** — **Show share QR…** draws the link on the existing QR canvas. A QR
  caps at ~2.9 KB, so the payload is `compactStateForShare()` (drops every
  value equal to its default; `normalizeLoadedState` restores them) with
  images omitted: the sample signature drops from a 3,483-char link to 1,513,
  and the compact state renders byte-identically (`sameRender: true`).
  Oversized states get an honest "too big for a QR" toast.
- **C4** — a shortcut sheet on the topbar `?` button and the `?` key (ignored
  while typing or while a dialog is open), listing `/`, Ctrl+Enter,
  Ctrl+Shift+E, undo/redo, `?` and Esc.
- **C5** — history entries carry `{key, params}`. `pushHistory()` call sites
  label the meaningful ones (reset section, sample, import, snapshot load,
  share, start over, JSON, reorder, add line/social); the undo/redo buttons
  are titled "Undo: reset Logo & photo" and the toast repeats it.
- **C6** — a first-run hint above the preview ("Click anything in the preview
  to edit it") with **Got it**, remembered in `sigstudio.hint.click`.
- **C7** — autosave failures now put a **Free up space** action *inside the
  toast* (opening the Saved panel); the footer-only button was dropped as
  redundant. `fmtSize()` uses `Intl.NumberFormat` with the document language
  ("3,2 MB" in German).
- 6 new E2E tests (sharing-shortcuts.spec.js). Suite 234/234 twice.

---

# v0.77.0 addendum (customisation batch 1 — styling system)

Date: 2026-11-21 · Scope: palette presets, contrast meter, name font,
social treatment, name colour.

- **Palettes**: the 12 colour themes now carry a `muted` tone and apply it, so
  one click sets the whole ramp (accent, text, muted, divider) rather than
  leaving a stale grey behind.
- **Contrast meter**: `#contrast-meter` shows Text / Muted / Link with the
  computed ratio and an AA/AAA verdict against the signature background
  (`#fff` when transparent). Recalculated on every render.
- **Name font**: new `design.nameFont` select — body typography stays put
  while the name can use Georgia, Courier New, Verdana, etc. Wired through
  `textStyle({font})` and Night's separate `lightStyle`, so both renderers
  agree. `''` = same as body (byte-identical default).
- **Social treatment**: `design.socialColorMode` — brand colours (default),
  monochrome (text colour) or outline (transparent fill, brand border and
  glyph), applied to icon chips and text-link styles.
- **Name colour** was already implemented (`design.nameColor`); this release
  adds the regression test that was missing.
- **Found by the meter**: the derived muted colour mixed 42 % toward white and
  measured **3.2:1** on a white signature — a real WCAG 1.4.3 failure in the
  default palette. It now mixes 28 % (4.6:1).
- 5 new E2E tests (styling.spec.js). Suite 239/239 twice.

---

# v0.78.0 addendum (templates I — three layouts and a picker that scales)

Date: 2026-11-21 · Scope: Booking, Vertical card, Reply, categories, chips.

- **Booking** — identity, contact stack, then the booking button as the one
  loud element; socials and legal stay quiet beneath. Booking is only shown
  when a URL exists, so the layout falls back gracefully to a plain centred
  signature.
- **Vertical card** — portrait (or monogram) on top at 1.8× logo width,
  centred identity, hairline, contact stack. Deliberately no two-column row:
  it is the layout that survives a 320 px mail view.
- **Reply** — one row: name · role · company · inline contact. No logo, no
  rule. Fits the 4th message of a thread.
- **Picker** — `TEMPLATES` entries now carry `category` (personal / business /
  creative) and an honest `badge` (noImages / photo / dark). `initTemplatePicker()`
  applies both from that single source, so a new template cannot miss the
  filter or invent a badge. Filter is a `role="group"` of pressed-state
  buttons.
- 4 new E2E tests (templates-batch.spec.js); visual baselines extended to 21
  templates. Suite 243/243 twice.

---

# v0.79.0 addendum (templates II — the sector layouts)

Date: 2026-11-21 · Scope: Academic, Clinic, Creator, Public sector.

- **Academic** — identity on the left, contact stack in a 42 % right column,
  rule beneath both. Department renders through the existing title line and
  office hours through a custom line, so the layout needed no new state.
- **Clinic** — status chip, contact, then an "Appointments" label and the
  booking button; admin details and the confidentiality note (legal text)
  follow. Falls back cleanly when no booking URL is set.
- **Creator** — name and tagline, social row immediately beneath, then a
  hairline, contact and the vCard QR. The social row precedes the contact
  block, which the test pins by index.
- **Public sector** — renders no images at all, a 2 px solid rule, and the
  existing land acknowledgement (behind `showAcknowledgement`). Honest
  "No images" chip.
- Picker gains a **Public** category. 25 templates; visual baselines extended.
- 1 new E2E test (templates-batch.spec.js). Suite 244/244 twice.

---

# v0.80.0 addendum (contact & QR — the last customisation batch)

Date: 2026-11-21 · Scope: contact layout/order, QR target, status presets,
audience variants.

- **Contact layout** — `design.contactLayout: 'inline'` joins the contact
  items with ` · ` on one line; stacked stays the default, so existing
  renders are unchanged. Works through the existing `contactInlineHtml`.
- **Contact order** — `design.contactOrder` is an array of keys; unknown keys
  keep their original relative order (custom lines share `custom`, so they
  stay stable). The Advanced list renders only present fields with ↑/↓
  buttons, disables the ends, and restores focus to the same arrow after the
  move.
- **QR target** — `qrPayload(state)` returns the vCard by default, or the
  user's URL when `qrTarget === 'url'`; an empty URL falls back to the vCard
  instead of encoding nothing. The cache key includes the payload, so
  switching targets cannot serve a stale matrix.
- **Availability presets** — Available / Working remotely / On leave set both
  text and colour; On leave can take a date and renders "On leave until
  {date}" in the current locale.
- **Audience variants** — one saved signature can be starred
  (`sigstudio.defaultSnap`); the quick switcher floats it first with a ★.
  Only one default is possible; starring again clears it.
- 5 new E2E tests (contact-qr.spec.js). Suite 249/249 twice.

---

# v0.81.0 addendum (receiver metadata I)

Date: 2026-11-21 · Scope: vCard photo, contact-card pack, plain text,
weight meter, sender identity, time zone.

- **vCard photo** — uploaded images are data: URLs, so Apple/Outlook address
  books previously got no picture. `vcardPhotoDataUrl()` centre-crops the logo
  to ≤240 px JPEG and `buildVCard(state, {photoDataUrl})` embeds it as
  `PHOTO;ENCODING=b`, folded at 72 octets. The QR path still calls
  `buildVCard(state)` with no photo, so QR density is unchanged.
- **Contact-card pack** — `contactCardFiles()` runs `bulkPlan` and emits one
  `.vcf` per ready row (same filename stem as the HTML export); the bulk
  modal gains "Contact cards (ZIP)".
- **Plain text** — `plainTextSignature()` produces a tag-free block from the
  same `contactItems` and socials the HTML uses, including time zone and
  legal text. Downloadable from the export menu.
- **Weight meter** — the export menu opens with "Signature HTML: X KB ·
  Gmail clips near 102 KB" and turns amber at 60 KB.
- **Sender identity** — shows `Name <email>` and copies it, with copy that
  says it belongs in the account's display-name setting, not the signature.
- **Time zone** — `profile.timezone` gains a field and renders in the context
  line (and plain text).
- 6 new E2E tests (receiver-metadata.spec.js). Suite 255/255 twice.

---

# v0.82.0 addendum (assets & BIMI)

Date: 2026-11-21 · Scope: asset pack, SVG Tiny PS, BIMI readiness.

- **Asset pack** — PNG icons at 32/180/512 rendered from the logo on a
  square canvas, plus `favicon.svg` and `logo-bimi.svg` when the source is an
  SVG, a `<link>` snippet and a README that states what each file is and that
  Proton's sender images are favicon-derived and unreliable.
- **SVG Tiny PS** — `svgToTinyPs()` parses the SVG, removes scripts, foreign
  objects, animations, `on*` handlers, filters and any non-fragment
  `href`, squares the viewBox around the artwork, and stamps
  `version="1.2" baseProfile="tiny-ps"`. Raster logos are refused with a
  toast rather than silently producing an invalid file.
- **BIMI readiness** — a modal that queries `_dmarc.<domain>` and
  `default._bimi.<domain>` through `dns.google`, grades DMARC enforcement,
  record presence, the logo URL and the mark certificate, and offers a
  copyable `default._bimi` record. The privacy note is explicit: the domain
  goes to Google only on Check.
- **CSP** — `connect-src` now allows `https://dns.google`; the shipped
  `e2e/selfhost.spec.js` still applies the exact policy live.
- 5 new E2E tests (brand-bimi.spec.js, DNS mocked). Suite 260/260 twice.

---

# v0.83.0 addendum (correctness batch)

Date: 2026-11-21 · Scope: portrait split, compatibility check, reorder focus.

- **Portrait** — `design.portraitUrl` is separate from the logo. Roundel,
  Photo card, Duotone and Vertical card render `portraitSrcOf()`; Classic and
  the rest keep the brand logo. The vCard photo prefers the portrait, and the
  roundel's manual `<img>` was switched to the same source so it cannot drift
  from its cell.
- **Compatibility check** — `compatIssues()` scans the generated HTML for
  heavy HTML (>60 KB warn, >100 KB fail), foreign `<style>` blocks,
  `@font-face`, scripts, flex/grid/absolute positioning, CSS background
  images, remote images, missing alt text, inline-image weight, and
  rounded corners under non-strict mode. The app's own 599 px media block is
  explicitly allowed.
- **Gate** — Copy (button and Ctrl/Cmd+Enter) runs `runCompatGate` before the
  existing rounding dialogue; hard failures open the modal with **Copy
  anyway**. The "Turn on strict Outlook" fix re-renders and re-runs the scan.
- **Focus** — the ↑/↓ buttons already existed for blocks, socials and custom
  lines; after a move the DOM was rebuilt and focus fell to `<body>`. Each
  reorder now refocuses the same button, falling back to the other arrow at
  the ends.
- 6 new E2E tests (correctness.spec.js). Suite 266/266 twice.

---

# v0.84.0 addendum (resilience & reach)

Date: 2026-11-21 · Scope: backup, bilingual block, receiver guide.

- **Backup** — `backupFiles()` returns `draft.json`, `saved/NN-<name>.json`
  for every snapshot, `backup.json` (app version, timestamp, index) and a
  README; the menu downloads it as `signature-studio-backup-YYYY-MM-DD.zip`.
  Restore stays the existing preset import — this is the escape hatch, not a
  migration engine.
- **Second-language block** — `design.altLabel` + `design.altBlock`, rendered
  by `taglineHtml` so every template that already shows a tagline gets it.
  Line breaks are preserved with `softBreak`, it respects `showTagline`, and
  the plain-text export includes it.
- **Receiver guide** — a six-section modal (avatar, display name, images,
  dark mode, clipping, BIMI) reachable from the export menu; it states that
  Microsoft does not display BIMI and that avatars come from address books.
- 3 new E2E tests (reach.spec.js). Suite 269/269 twice.

---

# v0.85.0 addendum (phone pass)

Date: 2026-11-21 · Scope: lazy thumbnails, section jump, share target.

- **Lazy thumbnails** — `renderThumbsNow()` now marks frames and observes
  them with `IntersectionObserver` (240 px margin); a rebuild clears the
  marker and re-observes, so visible tiles refresh on the idle pass and
  offscreen tiles wait until scrolled near. A no-observer fallback renders
  everything. The update-pill spec now scrolls the classic tile into view,
  which is the honest way to test a lazy grid.
- **Section jump** — a sticky `<select>` shown under 760 px, filled from the
  live section titles (so it follows translations); choosing one opens the
  section, scrolls it into view and focuses the summary.
- **Share target** — `share_target` (GET: title/text/url) added to the
  manifest. `consumeShareTarget()` accepts only vCard/HTML-looking payloads,
  opens the import modal prefilled, selects vCard mode when appropriate, and
  strips the query so a reload does not re-open it.
- 3 new E2E tests (phone.spec.js). Suite 272/272 twice.

---

# v0.86.0 addendum (restore, team photos, output contrast)

Date: 2026-11-21 · Scope: backup restore, per-row photos, contrast audit.

- **ZIP reader** — `unzipStore()` walks the EOCD and central directory and
  extracts store-only entries (our own archives); compressed entries are
  rejected by name rather than decoded wrongly.
- **Restore** — "Restore a backup…" reads `draft.json` and `saved/*.json`,
  shows the counts, and offers **Add to saved** or **Replace everything**.
  Restoring the draft pushes history first, so it is undoable; replacing the
  saved list is not (documented in the modal copy).
- **Team photos** — a real bug: `contactCardFiles()` embedded the base
  portrait in every row. Rows now clear `design.portraitUrl`, take an
  optional `photo` CSV column (`PHOTO;VALUE=URI`), and the team ZIP only
  shares an embedded image when the base photo is a logo, not a face.
- **Contrast audit** — `compatIssues()` now grades body text (fail <3, warn
  <4.5), muted text and links (<4.5) against the signature background.
- 5 new E2E tests (backup-restore.spec.js). Suite 277/277 twice.

---

# v0.87.0 addendum (cross-browser, CSP, static-host headers)

Date: 2026-11-21 · Scope: browser proof, script CSP, hosting parity.

- **Cross-browser** — `cross-browser.spec.js` covers boot/render, template
  switch and a real HTML download. Chromium runs it as part of the suite;
  `webkit-smoke` and `firefox-smoke` are opt-in projects (`CROSS_BROWSER=1`)
  because Safari/Firefox system libraries are absent on this host. Firefox was
  verified locally (3/3, with `LD_LIBRARY_PATH` pointing at the GTK sysroot);
  WebKit is verified by CI, which installs `--with-deps chromium webkit
  firefox`. The download test enables strict Outlook so it measures download
  plumbing rather than the rounding dialogue.
- **CSP** — the preview click-reporter is now `assets/js/preview-reporter.js`,
  loaded from the srcdoc through `script-src 'self'`; `script-src` no longer
  needs `'unsafe-inline'`. `style-src` keeps it because the output is inline
  styles by design. `e2e/selfhost.spec.js` still applies the exact policy and
  proves click-to-edit works.
- **Service worker** — the precache list was missing `compat.js` and
  `brand.js`; both (and the new reporter) are now cached, so offline installs
  have every feature.
- **Headers** — `_headers` (Netlify/Cloudflare Pages), `vercel.json` and
  `deploy/Caddyfile.example` carry the identical policy;
  `tools/check_headers.py` compares all four and rejects script
  `unsafe-inline`. Wired into CI; the app zip now includes them.
- 3 new E2E tests (cross-browser.spec.js) + 3 Firefox runs. Suite 280/280.

---

# v0.88.0 addendum (images in IndexedDB)

Date: 2026-11-22 · Scope: storage migration for image data.

- **Why** — localStorage is ~5 MB of UTF-16; two photos could fill it and
  silently break autosave. Images now live in IndexedDB (`sigstudio.images`),
  and localStorage keeps only text plus `idb:<id>` refs.
- **Shape** — state in memory always holds data URLs, so renderers, exports,
  share links and CID packaging are untouched. `refsForStorage()` swaps
  cached data URLs for refs at write time; `unpackImages()` resolves them at
  read time and repopulates the cache so a save cannot write bytes back.
- **Save stays synchronous** — `flushSave()` keeps its boolean contract and
  triggers `packCurrentImages()` afterwards; the follow-up save is what
  actually shrinks the draft. Uploads under 32 KB stay inline (no pointless
  writes).
- **Snapshots** persist refs; `loadSnapshotHydrated()` is used by the saved
  panel and quick switcher. **Backups** include `images/<id>.bin` entries and
  restore writes them back before applying the draft. **GC** deletes blobs
  that neither the draft nor any snapshot references.
- **Meter** — the saved panel gains an image count line, making it explicit
  that image bytes sit outside the 5 MB text budget.
- 5 new E2E tests (idb-images.spec.js). Suite 285/285 twice.

---

# v0.89.0 addendum (email import, and the .msg verdict)

Date: 2026-11-22 · Scope: .eml / .mht import; .msg investigated.

- **MIME reader** — `parseEml()` handles headers (unfolded), multipart
  boundaries (nested, depth-limited), base64, quoted-printable (soft breaks
  and `=XX` escapes) and charsets via `TextDecoder`. It returns the longest
  HTML part, else the longest plain-text part, plus the subject.
- **.eml / .mht** — both are MIME, so one parser serves both. The import
  modal gains "Import email (.eml / .mht)…"; the HTML is dropped into the
  existing textarea and parsed, so field recovery and the include/exclude
  chips behave exactly as for pasted HTML.
- **Importer improvement** — a visible `name@example.com` with no `mailto:`
  is now recovered (block boundaries respected; `Ltdada@example.com` was
  caught by a test before it shipped).
- **.msg — investigated, not shipped.** It is an OLE2/CFB compound file with
  MAPI property streams, not MIME: a reader needs FAT/miniFAT/directory
  traversal plus property-stream parsing and an RTF fallback (LZFu). That is
  several hundred lines of security-sensitive parsing, and there is no .msg
  fixture in the repo or on this machine to verify against — generating one
  needs Outlook. The handler detects the `D0 CF 11 E0` magic and explains the
  supported route. Outlook can save a message as **.mht** (Web Page) or
  **.html**, and both now import.
- 5 new E2E tests (eml.spec.js: QP multipart, base64, QP escapes, .mht,
  .msg detection). Suite 290/290 twice.

---

# v0.89.1 addendum (duplicate social rows)

Date: 2026-11-22 · Scope: one rendering bug, reported from the live demo.

- **Symptom** — many templates showed the social chips twice; Creator showed
  one row under the name and another after the contact block.
- **Cause** — two independent defects. (1) Seven layouts emitted their own
  row with `socialsPos(d) !== 'underName'`, which is true for `inContact`,
  while `contactStackHtml` also appended a row for `inContact`. (2) Creator,
  Vertical, Booking, Roundel and Photo card print a social row of their own
  regardless of position and still let the stack append one.
- **Fix** — bottom-row emissions are now `=== 'bottom'`; layouts with their
  own row pass `{ socials: false }` to the stack; Academic, Clinic and Public
  sector suppress their own row for `inContact` so the stack owns it; Custom
  and Postcard use their dedicated blocks. Reply is unchanged and
  intentionally has no social row.
- **Guard** — `version-socials.spec.js` now walks all 25 templates × three
  positions and asserts exactly one row (zero for Reply), so this cannot
  silently return.
- Suite 291/291 twice.

---

# v0.90.0 addendum (layout variants, history memory)

Date: 2026-11-22 · Scope: variants and undo memory.

- **Variants** — three controls under the template picker:
  `design.mirrorLayout` swaps the two columns in Classic, Compact, Split,
  Photo card and Academic (logo side XOR `logoPosition`; Academic swaps and
  re-aligns the contact column). `design.photoLayout` moves the Photo card
  photo above the name and the Vertical card photo beside it. The compact
  switch writes the existing `density` setting and stays in sync with the
  Spacing select.
- **Supported-set honesty** — mirroring is implemented where a two-column row
  exists; the hint names those templates rather than pretending it applies
  everywhere. Vertical's portrait gained `data-edit="logo"`, which also makes
  click-to-edit work there.
- **History memory** — `pushHistory` stores `refsForStorage(state)` (image
  refs) instead of deep clones with data URLs, estimates each entry's size,
  and trims oldest entries beyond a 6 MB character budget (count cap stays
  at 50). `doUndo`/`doRedo` are async and hydrate refs before applying;
  states without refs still apply synchronously.
- **GC** — `gcImages(extraIds)` now keeps images referenced by undo/redo
  stacks (`historyImageIds()`), so collecting after a delete cannot blank an
  undo entry.
- 6 new variant tests (variants.spec.js) + 3 history tests (undo.spec.js).
  Suite 300/300 twice; Firefox smoke 3/3.

---

# v0.91.0 addendum (data safety, hostile input)

Date: 2026-11-22 · Scope: persistence, eviction recovery, malformed input.

- **Persistence** — `requestPersistence()` calls `navigator.storage.persist()`
  when the first image is packed or the first snapshot is saved;
  `persistenceStatus()` reads `persisted()` for the UI. The Saved panel shows
  "Persistent storage granted" (green) or "may clear saved images — keep a
  backup" (amber); unsupported browsers say so.
- **Eviction is visible** — `unpackImages()` counts missing blobs;
  `hydrateStateImages()` shows one toast with the count and a **Restore a
  backup** action that opens the same file input as the menu. Previously the
  slot silently became empty.
- **Hostile input** — new suite: truncated ZIP, EOCD with a bogus central
  directory, unterminated MIME boundary, 200k-character quoted-printable
  payload, invalid base64, 40-deep nested multipart, 2,000-deep nested HTML,
  unterminated vCard and binary garbage. Assertions: no thrown errors, no
  console/page errors, each parser under 5 s.
- **Real bug found** — invalid base64 in a MIME part made `atob` throw out of
  `parseEml`. `emlBase64Bytes()` now treats undecodable data as an empty
  part, so a malformed email cannot break the importer.
- 3 persistence/recovery tests + 4 hostile tests. Suite 307/307 twice;
  Firefox smoke 3/3.

---

# v0.92.0 addendum (mailbox.org fit)

Date: 2026-11-22 · Scope: install guidance, paired reply signature.

- **mailbox.org tab** — six steps covering paste-rendered installation, the
  separate reply slot, per-sending-address defaults for aliases, the image
  caveat (attachments / dropped data: URIs / remote images blocked by
  recipients), and "if your Suite shows *New from template*" because feature
  flags vary. Note: no BIMI in mailbox webmail; custom domains only.
- **Save reply variant** — clones the open signature, switches the copy to
  the Reply template, names it `<name> — Reply` and saves it, leaving the
  editor untouched. Matches OX's separate defaults for new vs replies.
- **Fixed** — `packCurrentImages()` packed the live state, replacing image
  data URLs with `idb:` refs; after autosave the preview's images broke until
  a reload. It now packs a copy, so storage gets refs and the editor keeps
  its pixels. Test asserts both the draft ref and the rendered data URL.
- **i18n guard refined** — only flags fallback text equal to its key, so
  labels like "mailbox.org" no longer false-positive.
- 3 new tests (guide copy, reply pairing, live preview). Suite 310/310 twice;
  Firefox smoke 3/3.

---

# v0.93.0 addendum (client proof kit)

Date: 2026-11-22 · Scope: real-inbox testing, Outlook chip rendering.

- **Test email** — Export → *Test in a real inbox…* builds a
  `multipart/alternative` message: a plain-text checklist and the signature
  HTML. Data-URI images become `multipart/related` parts with
  `Content-ID: <sigstudio-…>`; hosted images stay URLs. Addressed to the
  user's own address (profile or contact), never sent by the app.
- **Checklist** — seven checks (images, corners, dark mode, Gmail clipping,
  QR, social links, sender identity), shown in-app and copyable; the same
  text rides in the plain-text part.
- **BIMI honesty** — typing a mailbox.org domain states that the address
  cannot publish BIMI and the Suite does not display it; custom domains can.
- **Outlook chips fixed** — a real Outlook screenshot showed social chips as
  blank blue bars. Inline-block spans lose width/height in the Word engine;
  chips are now table cells with explicit dimensions, CSS centring and
  ASCII-safe glyphs (X, ig, yt, tt, wa, sp, ko, Be). Radius falls back to a
  square in strict Outlook, as elsewhere.
- **Fixed** — `toast.copyFail` had no entry and leaked as a raw key when the
  clipboard was blocked; all four locales now carry it.
- 5 new tests (checklist, MIME structure, missing address, BIMI hint, chip
  markup). Suite 315/315 twice; Firefox smoke 3/3.

---

# v0.94.0 addendum (RTL content)

Date: 2026-11-22 · Scope: right-to-left signatures.

- **Direction control** — Design → Text direction: LTR (default) or RTL.
  Stored as `design.direction`; imports coerce anything else to LTR.
- **Rendering** — `dir="rtl"` and `direction:rtl` on `<html>`, `<body>` and
  the outer table; the table's direction reverses cell order (logo side,
  social chips). A post-pass swaps `align`, `text-align`, `padding-left/
  right`, `margin-left/right` and `border-left/right` so "start" is the
  right edge. Mobile stacking aligns right too.
- **Scope** — content direction, not a full UI localisation: the editor
  chrome stays LTR because there are no RTL locales yet.
- 3 tests (direction and swaps, save/reload/export, exact LTR restoration).
  Suite 318/318 twice; Firefox smoke 3/3.

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
