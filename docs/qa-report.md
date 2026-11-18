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
