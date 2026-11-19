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
