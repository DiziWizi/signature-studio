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
- [x] v0.15.0 — socials position (bottom / under the name / with contact
  details) across the main layouts; the preview now sits inside a realistic
  email compose window (To/Subject rows, body, signature separator) whose
  body follows the white/grey/dark backdrop toggle; E2E now 44
- [x] v0.16.0 — accessibility pass: modal focus trap + focus restore,
  keyboard-operable switches/segmented controls, aria-labels on every icon
  button, named dialogs, role=status toasts, skip-to-content link,
  visible focus rings everywhere, prefers-reduced-motion; E2E now 49
- [x] v0.17.0 — four new templates (14 total): Postcard (casual card with
  accent strip), Line (casual one-liner with tiny socials), Duotone
  (creative accent panel with white identity text), Quote (personal,
  optional italic favourite quote via the new quoteText field); E2E now 53
- [x] v0.18.0 — honorifics + post-nominals (signature, plain text, vCard
  3.0 N components, 4.0 HONORIFIC-PREFIX/SUFFIX); PGP public key line in
  the signature and KEY;TYPE=PGP in both vCards; vCard photo (PHOTO from a
  hosted logo URL); privacy networks Matrix, Keybase, Threads added
  (Signal/Telegram/Mastodon/BlueSky already existed) with URL detection;
  E2E now 57
- [x] v0.19.0 — vCard completeness: NICKNAME (display name), TZ, LANG and
  BDAY properties in both cards; stable deterministic UID (no more
  duplicate contacts on re-import) + REV timestamps; birthday and timezone
  fields in the editor; E2E now 58
- [x] v0.20.0 — secondary email (signature, plain text, second
  EMAIL;TYPE=INTERNET in both vCards) and configurable per-field contact
  labels (Email, Phone, Mobile, Address, Secondary email — e.g. "Direct
  line"); E2E now 60
- [x] v0.21.0 — company tagline (renders under the company in every layout
  that shows it, plain text too); logo/banner alt text fields; photo shape
  (square/rounded/circle, superseding the round toggle with legacy-state
  migration); name weight (bold/semibold/normal); E2E now 64
- [x] v0.22.0 — clickable banner (bannerLink wraps the banner image in
  Banner and Split layouts, javascript: schemes refused) and a signature
  width slider (400–600, drives the inner table width); E2E now 66
- [x] v0.23.0 — payment networks: PayPal, Venmo, Cash App, Revolut, Monzo
  (chips, quick-add dropdown, URL detection); E2E now 67
- [x] v0.24.0 — Enterprise template (15 total) + organisational field set:
  team/initiative line, boxed IT-support module (title, chat chip, tagline,
  local/international phones, alternate instructions), recognise link line,
  purpose statement, land acknowledgement, three-slot brand footer; 22 new
  optional fields, all sections hidden when empty; E2E now 70
- [x] v0.33.0 — CSV bulk generation (header-matched columns, ZIP of
  signature files, skipped rows counted, blank identity per row); E2E now 96
- [x] v0.34.0 — performance: preview coalesced to one render per frame,
  thumbnails gated on the Design section + 400ms throttle, cached QR
  tables, scrollable export menu; E2E now 98
- [x] v0.35.0 — UI polish: hover states gated behind (hover: hover) for
  touch, 0.96 press scale on buttons, scroll-contained modals/panels/menus
- [x] v0.36.0 — writing/accessibility pass: copy and contrast audited
  clean (worst text pair 6.5:1), overscroll containment on the audit list
- [x] v0.37.0 — vCard import (3.0/4.0 paste or .vcf file, honorifics,
  PRONOUN, PGP) + keyboard shortcuts (Ctrl+Enter copy, Ctrl+Shift+E menu);
  E2E now 101
- [x] v0.38.0 — idle-rendered template thumbnails, service-worker update
  pill with reload, compact topbar under 480px; E2E now 103
- [x] v0.39.0 — style depth: email-safe font picker + custom stacks, link/
  name/muted colour controls, tagline weight, name letter-spacing, five
  new palettes; E2E now 108
- [x] v0.40.0 — fine-tuning: spacing/line-height/alignment overrides on
  the density presets, card padding + border controls; E2E now 111
- [x] v0.41.0 — the Custom template: drag-to-reorder section blocks
  (identity, divider, contact, socials, banner, footer, QR, custom HTML);
  E2E now 114
- [x] v0.42.0 — adversarial-UX fixes: duplicate theme, clipped swatch
  names (from the hostile-user test)
- [x] v0.43.0 — UX follow-ups: grouped export menu, honest wizard photo
  copy, manual-copy fallback
- [x] v0.44.0 — welcome pass: essentials-first first visit, empty-state
  preview guide, live Outlook-safe trust badge, 4-step pointer tour after
  the wizard; E2E now 124
- [x] v0.45.0 — Simple/Advanced editor mode: new visitors start Simple
  (expert sections, fine-tuning and power tools hidden, state preserved);
  existing advanced drafts keep Advanced; choice persists; E2E now 127
- [x] v0.46.0 — Office-hours quick-add; Custom lines visible in Simple
  mode; E2E now 128
- [x] v0.47.0 — dark-mode fix: support-module title was white-on-white
  when Dark Mode Friendly was on; card wrapper gets scoped dark colours;
  E2E now 131
- [x] v0.48.0 — CID image mode: every image emitted as
  cid:sigstudio-<key> (logo/banner/footer×3/socials) with hosted-URL and
  base64 modes untouched; bulk ZIP gains a manifest.json + extracted
  image assets when CID is on; checklist warns about hand-pasting;
  E2E now 134
- [x] v0.49.0 — image optimisation on export: bulk CID assets are
  downscaled to their display size and re-encoded (JPEG 0.85 for
  photos, PNG for transparency, keeps whichever is smaller); the audit
  now recommends the right image strategy; E2E now 137
- [x] v0.50.0 — version number in the app footer; per-image reference
  controls (as stored / inline CID) beside every image field incl.
  upload buttons for all three brand-footer slots; socials position
  "under the name" now honoured on every template (was bottom on
  Enterprise, Night-adjacent layouts, Letterhead and more); CI guards
  version consistency across package.json/app.js/sw.js; E2E now 140
- [x] v0.51.0 — "Signature + images (ZIP)…" export: the current
  signature as a pipeline-ready ZIP (HTML + optimised image parts +
  manifest) without needing the CSV bulk flow; explains itself when
  no image is in CID mode; E2E now 141
- [x] v0.52.0 — layout fix: the sidebar now scrolls internally on
  desktop instead of clipping at the fold (body is a definite-height
  flex column; the app row gets an explicit 1fr grid row); the page
  no longer carries a permanent scrollbar from the version footer;
  narrow widths still scroll the page as a whole; E2E now 143
- [x] v0.53.0 — AI-built disclosure added to the README (Roost-style
  blockquote) and as a small line in the app footer; E2E still 143
- [x] v0.54.0 — footer disclosure shortened to "Built largely with AI
  assistance."
- [x] v0.55.0 — pronouns position: optional "Under the name" places
  them on their own line in a slightly smaller size (default stays
  inline, byte-identical); E2E now 146
- [x] v0.56.0 — Design section right column no longer clipped: grid
  tracks can shrink (minmax(0,1fr) + min-width:0), range rows wrap;
  E2E now 147
- [x] v0.57.0 — progressive settings (proposal C): sections follow the
  signature top-to-bottom (Template & layout → Identity → Logo & photo
  → Contact → Social links → Organisation → Colours & type → Blocks →
  Advanced → Show/hide); all socials controls live in Social links;
  nested sub-groups (Colours/Typography/Spacing/Divider, Style &
  position, vCard extras, Support module); conditional visibility hides
  controls whose feature is off or whose subject is empty; E2E now 152
- [x] v0.58.0 — settings search (Ctrl/Cmd+K, filters across sections,
  reveals feature-hidden controls, empty state) and preview → settings
  linking (click any element in the live preview to jump to and flash
  the control that produces it; data-edit annotations stripped from
  every export); E2E now 157
- [x] v0.59.0 — template-aware dimming (banner, quote, QR, support
  module, logo position, photo shape dim with an "Only in …" chip off
  their templates); inline visibility eyes on 10 identity/contact
  fields (dim instead of disappear, synced with Show/hide); per-section
  reset buttons (design settings only, never content); E2E now 162
- [x] v0.60.0 — adversarial-pass fixes: copy never hangs (1.5s timeout
  → legacy → manual modal, always feedback); scheme-less image URLs
  become https:// and junk URLs are audit-flagged; the tour waits for
  the first edit instead of landing on a blank preview (the reported
  "wizard fires mid-task" was a false positive — measurement error,
  see QA report); first visit opens Identity only; field labels 12px;
  E2E now 166
- [x] v0.61.0 — guidance: every checklist warning is a button that jumps
  to the control that fixes it (opens sections/sub-groups, flashes the
  field); the instructions page now carries its own Copy-signature
  button (all six client tabs start with it); export menu renamed
  "How to add it to Outlook, Gmail…"; E2E now 170
- [x] v0.62.0 — Simple mode hides expert formats (Apple Mail, Thunderbird,
  vCards, Import HTML); plainer labels (Spacing preset, Width, Text
  size); eyes on team, tagline, status and the socials row; team field
  dimmed as enterprise-only; E2E now 174
- [x] v0.63.0 — narrow-window preview peek: a floating Preview button
  (≤980px) opens a live bottom sheet mirroring the preview, streaming
  edits and closing on Escape/Close; desktop unaffected; E2E now 176
- [x] v0.64.0 — uploads are optimised, not rejected: any image under 8 MB
  is downscaled to 2× its display slot and re-encoded (JPEG/PNG), so a
  2 MB phone photo becomes tens of KB and embeds cleanly; toast reports
  the saving. Empty state gains "Or start from an example"; E2E now 179
- [x] v0.65.0 — accessibility + visual regression: @axe-core/playwright
  audits the editor and overlays (0 serious/critical after fixes);
  section reset/eye moved out of summaries; ranges and selects named;
  stage focusable; contrast fixes. 19 screenshot baselines (18 layouts
  + editor), local-only; E2E now 183
- [x] v0.66.0 — destructive edits are undoable: section reset and JSON
  editor apply now push history (sample, wizard, import, start-over,
  saved-snapshot loads already did); E2E now 185
- [x] v0.66.1 — CI smoke test no longer pipes curl into `grep -q`
  (pipefail + 64 KB pipe buffer = exit 23 once index.html outgrew it)
- [x] v0.66.2 — the v0.65 section-tools label rendered a raw i18n key;
  key added ×4 and a locale sweep spec now fails on any raw key; E2E 189
- [x] v0.67.0 — security audit fixes: preview document sanitised at the
  sink (script/iframe/on*/javascript:/vbscript: stripped) and again on
  every load, so shared links and imported JSON can no longer script the
  app; ?sig= with work open now asks before replacing and stays undoable;
  preview message listener checks origin + source; E2E 194
- [x] v0.68.0 — output safety: URL scheme allow-list (javascript:/vbscript:/
  data:text/html refused, host:port preserved), checklist warnings for
  incomplete email/phone/website and very long tokens, `<wbr>` soft breaks
  plus word-wrap on text so long words no longer push the signature
  sideways; E2E 197
- [x] v0.69.0 — sharing batch: bulk filenames include the email local part
  (no ZIP collisions) and exact duplicate rows are counted; share links
  warn above 8 KB and gain "Copy share link without images"; paste-import
  recovers phones (bare and labelled) and company, never phone-as-title;
  imported types are coerced instead of rendering [object Object]; E2E 201
- [x] v0.70.0 — polish batch: autosave is a trailing debounce with a footer
  status (Saved locally / Saving… / Not saved — storage full); one live
  toast per key; reset buttons and sliders meet the 24 px target minimum;
  a "Remote images" switch stops the preview (and thumbnails) from pinging
  image hosts; E2E 206
- [x] v0.71.0 — self-host correctness: Dockerfile copies an allow-list and
  .dockerignore keeps dev material out (tools/check_selfhost.py guards it in
  CI); nginx.conf ships CSP/X-Frame-Options/Permissions-Policy and 404s dev
  paths; share links above 8 KB default to the image-free variant (hosts
  reject longer request lines) with "with images" as an explicit menu item;
  settings search moves to "/" and Ctrl+Shift+K (Ctrl+K belongs to the
  browser); E2E 209
- [x] v0.72.0 — ops polish: releases ship signature-studio-<v>-app.zip
  (deployables only, 391 KB); Saved shows a storage meter, per-snapshot
  sizes and "Delete oldest" (never the last one); the service worker waits
  for the update pill instead of skipWaiting; <noscript> notice; README no
  longer hardcodes a test count; E2E 213
- [x] v0.73.0 — form semantics: autofill tokens + tel/url input types on
  identity and contact fields; inline errors wired with aria-invalid and
  aria-describedby; checklist/search/saved-count live regions; a real h1
  and ten h2-level section headings; template dimming no longer lowers text
  contrast (dashed outline + chip instead); E2E 219
- [x] v0.74.0 — modals & contrast: the Saved panel is a labelled
  aria-modal dialog with a Tab trap and Escape; deleting a snapshot keeps
  focus in the list; the preview sheet is an honest non-modal region;
  forced-colours rules border the toast/status surfaces; thumbnail previews
  scale to their tile instead of clipping at 320 px; E2E 224
- [x] v0.75.0 — team flow: bulk CSV now previews every row with its fate
  (filename / no name / no email / duplicate) before generating, sniffs
  ;/tab delimiters and strips BOMs; paste-import shows per-field chips so
  you keep only what you trust; E2E 228
- [x] v0.76.0 — sharing & shortcuts: QR of a compact (images omitted) share
  link; a keyboard-shortcut sheet on "?"; undo/redo name their action in the
  tooltip and toast; first-run "click the preview to edit" hint; storage
  errors carry a "Free up space" action in the toast; sizes use locale
  number formatting; E2E 234
- [x] v0.77.0 — styling system: colour themes now set the full type ramp
  (muted included) and a WCAG contrast meter grades text/muted/link against
  the background; separate name font (body stays put, Night included);
  name colour verified; social icons switch brand / monochrome / outline;
  derived muted text fixed from 3.2:1 to 4.6:1; E2E 239
- [x] v0.78.0 — templates I: Booking (CTA-led), Vertical card (phone-width)
  and Reply (one line for threads); the picker gains Personal / Business /
  Creative filters plus honest layout chips (No images / Photo / Dark) fed
  from template metadata; E2E 243
- [x] v0.79.0 — templates II: Academic (CV split), Clinic (appointments
  first), Creator (social hero) and Public sector (image-free, high
  contrast, land acknowledgement); picker gains a Public filter; E2E 244
- [x] v0.80.0 — contact & QR: contact lines can be inline and reordered
  (Advanced), the QR can encode a link instead of the vCard, availability
  presets set the status badge (with an optional return date), and one saved
  signature can be starred as the default variant for the quick switcher;
  E2E 249
- [x] v0.81.0 — receiver metadata I: vCards embed a downscaled photo and a
  team CSV becomes a pack of contact cards; plain-text signature export; the
  export menu reports HTML weight against Gmail's ~102 KB clip; sender name &
  address copy helper; time zone joins the context line; E2E 255
- [x] v0.82.0 — assets & BIMI: brand asset pack (favicons, apple-touch icon,
  snippet, README), SVG Tiny PS conversion that strips scripts and external
  refs, and an opt-in BIMI readiness check via DNS-over-HTTPS with a copyable
  record; honest copy that Microsoft never displays BIMI; E2E 260
- [x] v0.83.0 — correctness: a separate portrait feeds the vCard photo and
  photo-led templates (logo stays the brand mark); a local compatibility scan
  catches Word-engine/Gmail hazards and gates Copy on hard failures, with a
  one-click strict-Outlook fix; arrow reorders keep keyboard focus; E2E 266
- [x] v0.84.0 — resilience & reach: one ZIP backs up the draft, every saved
  signature and an index; a second-language block renders under the tagline
  (and in the plain-text export); an in-app "What recipients see" guide
  explains avatars, display names, image blocking, dark mode and clipping;
  E2E 269
- [x] v0.85.0 — phone: template thumbnails render lazily as tiles approach
  the viewport; narrow screens get a sticky "Jump to" section picker; a PWA
  share target accepts a vCard or HTML signature and opens the importer with
  the right mode; E2E 272
- [x] v0.86.0 — close the loop: backups restore from a ZIP (merge or
  replace), team contact cards no longer copy one headshot onto everyone and
  accept a per-row `photo` column, and the compatibility scan grades the
  final text/muted/link contrast; E2E 277
- [x] v0.87.0 — confidence: Firefox smoke runs locally and WebKit/Firefox run
  in CI; the preview click-reporter moved to a real file so CSP drops
  `unsafe-inline` for scripts (styles keep it by design); Netlify/Cloudflare,
  Vercel and Caddy header files share the exact nginx policy, enforced by
  `tools/check_headers.py`; E2E 280
- [x] v0.88.0 — images in IndexedDB: uploads above 32 KB move out of the
  5 MB localStorage budget and persist as `idb:` refs (state stays data URLs
  in memory); snapshots, backup/restore and garbage collection follow; the
  saved panel says how many images live outside the text budget; E2E 285
- [x] v0.89.0 — email import: .eml and Outlook .mht archives are read with a
  dependency-free MIME parser (multipart, base64, quoted-printable, charset)
  and fed to the existing importer; plain-text email addresses are recovered
  when there is no mailto link; .msg is detected and explained, with the
  .mht/.html route instead; E2E 290
- [x] v0.89.1 — fix: social icons rendered twice at some positions. Seven
  layouts emitted their own row for anything except "underName" while the
  contact stack also appended one for "inContact"; five hero-row layouts
  ignored the position entirely. Bottom is now gated to "bottom", the
  contact stack is authoritative for "inContact", and a 25×3 regression
  test pins exactly one row (Reply intentionally has none); E2E 291
- [x] v0.90.0 — variants & history memory: layouts gain mirror columns and
  side/above photo placement (Classic, Compact, Split, Photo card, Academic,
  Vertical card) plus a compact-spacing switch bound to Density; undo history
  stores image refs instead of bytes with a 6 MB budget, hydrates on
  undo/redo, and GC keeps images referenced only by history; E2E 300
- [x] v0.91.0 — data safety: the app asks for persistent storage when the
  first image is packed and states the result in the Saved panel; evicted
  images are reported with a Restore-backup action instead of blanking
  silently; a hostile-input suite covers malformed ZIPs, MIME, quoted-
  printable bombs, deep HTML nesting and garbage vCards — and found a real
  bad-base64 crash; E2E 307
- [x] v0.92.0 — mailbox.org fit: a dedicated install tab (paste-rendered
  workflow, separate reply slot, per-alias defaults, image caveat, "New from
  template" phrasing, no BIMI); **Save reply variant** stores a paired Reply
  copy without touching the open signature; fixed image packing mutating the
  live state into idb: URLs (preview went blank after autosave); E2E 310
- [x] v0.93.0 — client proof kit: "Test in a real inbox" builds a real
  multipart/alternative .eml (plain-text checklist + HTML signature, inline
  images as multipart/related CID parts), with a copyable checklist; BIMI
  now states that @mailbox.org cannot publish or display it. Fixed social
  chips for Word-engine clients (table cells, ASCII-safe glyphs) after a real
  Outlook screenshot showed blank bars; E2E 315
- [x] v0.94.0 — RTL content: per-signature direction (LTR/RTL) sets `dir`
  on the document, table and body, reverses cell flow and swaps explicit
  left/right alignments, padding, margins and borders; mobile stacking
  follows the direction; E2E 318
- [x] v0.95.0 — backup health: backups are re-opened and verified before
  download, the Saved panel shows the last backup's age, and an amber nudge
  appears when storage is evictable and the backup is missing or over a week
  old; E2E 321
- [x] v0.95.1 — iOS Mail install tab: plain-text export, the correct
  Settings → Apps → Mail → Signature path, Per Account, and the blunt truth
  that iOS signatures are text-only and do not sync from a Mac or iCloud;
  E2E 322
- [x] v0.96.0 — rendering matrix: whole-library composites for LTR, RTL,
  strict Outlook and narrow widths; the RTL pass found and fixed reversed
  phone numbers (bidi isolation for Latin contact values) and misplaced
  legal punctuation; E2E 323
- [x] v0.97.0 — dark-mode logo pair: optional second mark swapped in
  `prefers-color-scheme: dark` (Apple Mail/iOS), hidden inline so Outlook
  keeps the light logo; travels through IndexedDB, CID packages, test emails
  and backups; E2E 325
- [x] v0.98.0 — picker curation: search across 25 names/descriptions,
  a "Start here" six, live visible count and an honest empty state; the
  existing category chips now intersect with the query; E2E 327
- [x] v0.99.0 — classic Outlook install pack: a ZIP with `<name>.htm`,
  `<name>_files/` relative images and a README for
  `%APPDATA%\Microsoft\Signatures`; hosted URLs stay remote; E2E 330
- [x] v0.28.0 — photo re-crop (centre/left/right from the session-kept
  original, never persisted); E2E now 81
- [x] v0.29.0 — i18n: dependency-free t() layer, 435 keys × en/de/es/fr,
  auto-detect + topbar language switcher with persistence, live
  re-rendering of toasts/checklist/wizard, service-worker precache;
  English default byte-equivalent (all prior tests unchanged); E2E now 86
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
