# Bowerbird Signature Builder — Design

Date: 2026-11-18 · Status: approved by user instruction ("plan and execute")

## Intent

A self-hostable web tool for creating and editing HTML email signatures: profile
and contact details, website links, social media links, custom lines, legal
footers, template layouts, and one-click export into Gmail / Outlook / Apple
Mail / Thunderbird. Everything runs locally in the browser — no backend, no
accounts, no data leaving the machine.

## Goals

- Produce **email-client-safe HTML**: table-based layout, every style inline,
  no `<style>`/classes in the default output (Outlook desktop renders with the
  Word engine and ignores embedded stylesheets).
- Live preview at real size, with desktop / phone widths and dark-mode
  backdrop simulation.
- Social links for the common networks rendered as Outlook-safe glyph chips
  (text glyphs, not images — images add a hosting dependency and are blocked
  in several clients).
- Edit existing signatures: best-effort HTML import.
- Export: copy rich HTML to clipboard, download `.html`, plain-text fallback.
- Persistence: draft autosave + named saved signatures (localStorage).
- Packaging: plain static files; Docker (nginx) for self-hosting; Forgejo
  Actions check + tag releases with source archives.

## Non-goals

- No backend, accounts, image hosting, or server-side rendering. (Image
  hosting is deliberately left to the user — that is the reliable model for
  email clients.)
- No email-sending or client integration.
- No i18n in v1; no undo history beyond native input undo.

## Approaches considered

1. **Static vanilla JS single-page app (chosen).** No build step, no
   dependencies, runs from `file://` or any static host, trivially
   containerised. Downsides: more manual DOM wiring; mitigated by the small
   scope.
2. **Framework app (React/Vue + bundler).** Nicer DX, but adds a build step,
   node_modules, and tooling overhead for a single-page form + renderer; the
   renderer (string-building HTML) gets no benefit from a VDOM.
3. **Backed service with accounts/syncing.** Rejected: privacy-sensitive
   (signatures contain personal data) and unnecessary for the job.

## Architecture

```
index.html            app shell: editor, preview, modals
assets/styles.css     app UI (modern CSS; not part of generated output)
assets/js/state.js    data model + defaults + sample data
assets/js/socials.js  network catalogue (glyph, brand colour, URL prefix)
assets/js/templates.js  signature renderer: 5 layouts → full HTML document
assets/js/import.js   best-effort HTML signature parser
assets/js/export.js   clipboard / download / plain-text
assets/js/storage.js  localStorage draft + saved snapshots
assets/js/app.js      wiring: bindings, social/custom rows, modals, toasts
```

State shape: `{profile, contact, socials[], customLines[], design{…}, meta}`.
The renderer is pure: `state → HTML string`. The preview is an `<iframe
srcdoc>` so exported HTML is exercised exactly as shipped.

## Key decisions (my call, flagged for user review)

- Repo `SlopWare/signature-studio`, private (matches user's standing
  preference; a public repo + Forgejo Pages demo is on the roadmap).
- Social icons are brand-coloured text-glyph chips instead of image icons
  (works in Outlook, zero image hosting).
- `darkModeFriendly` toggle adds Gmail/Apple-Mail `prefers-color-scheme`
  overrides as an *opt-in enhancement layer*; default output stays maximally
  compatible.
- Template set: Classic, Centered, Compact, Banner, Minimal.

## Remaining to the builder

Visual polish, exact field set, copywriting, and test depth.
