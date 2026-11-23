# Bowerbird — Personal signatures roadmap

Recommendations focused on **personal** email signature users (individuals,
freelancers, creators, job-seekers) rather than corporate brand users. Sorted
by impact for that audience; each item includes the why and roughly what it
takes. Items are independent unless noted.

## Tier 1 — biggest wins, all small to medium

**1. Curated colour themes** *(small)*
One-click swatch sets (6–8 tasteful palettes: e.g. "Slate", "Forest", "Ocean",
"Terracotta", "Ink", "Mono") that set accent/text/divider colours together.
Personal users have no brand guidelines, and three manual colour pickers are
the biggest visual-friction point. Keep the manual pickers; themes are an
entry point, not a replacement.

**2. Personal/creator networks in the socials catalogue** *(trivial — metadata
only)*
Medium, Substack, Behance, Dribbble, Twitch, Discord, Etsy, Vimeo, Goodreads,
Letterboxd, Spotify, Ko-fi / Buy Me a Coffee. The catalogue is pure data
(glyph + colour + URL prefix), so each network is one line. Coverage feels
like the app "knows" personal users. Glyphs should follow the existing
text-glyph convention (Outlook-safe).

**3. Availability / status badge** *(small–medium)*
An optional chip above or below the name: "Open to freelance work",
"Currently on parental leave", "Hiring" — text + colour, green by default.
This is one of the most-requested personal signature features and no template
currently supports it. Renders as an Outlook-safe inline chip; off by default.

**4. Personal identity fields** *(small)*
- Preferred / display name separate from full name (autofill into vCard `N`).
- Location line: "Based in Melbourne · UTC+11" (city + timezone, both optional).
- Languages: "English · 中文" as a small line.
Personal users show context, not a corporate address. Each is a field + one
renderer line.

**5. Booking link field** *(small)*
First-class "Book a call" field (Calendly/Cal.com) rendered as a small
accent-coloured link chip in templates that show contact details. Freelancers
and coaches put this in every signature; today it competes for a custom line.

## Tier 2 — medium effort, high personal relevance

**6. Onboarding wizard** *(medium)*
Three or four questions on first run — "Pick a vibe" (theme), "Photo or
initials?", "What do you do?" — that preset template, theme and starter
fields. Corporate users arrive with a brand kit; personal users arrive with
nothing. The wizard replaces their blank-page moment. Persist a `done` flag so
it never nags.

**7. Sample personas** *(small–medium)*
Cycle "Sample data" through 4 personas: freelancer, designer, academic,
developer — each with fitting fields, networks and a custom line. Personal
users need to see *themselves* in the sample, and one corporate sample
doesn't do that.

**8. Quick-switch saved signatures** *(small–medium)*
One-click switching between saved snapshots from the top bar (Work /
Freelance / Personal) instead of opening the Saved panel. Personal users run
2–3 signatures daily; corporate users run one. Reuses the existing snapshot
storage; adds a small dropdown and load wiring.

**9. Background card style** *(medium)*
Optional soft background tint + rounded border behind the whole signature
(card look). Degrades to a plain block in Outlook — acceptable per the
existing border-radius policy. Personal signatures get flair; corporate ones
keep it off.

**10. Round-photo toggle** *(small–medium)*
`border-radius:50%` option for the side logo in Classic/Compact/Split (today
only Roundel is round). Personal users want their face as a circle next to
their name. Also: an upload-time square crop helper (auto-centre-crop to
square) so photos don't skew.

**11. Conciseness hint** *(small)*
A subtle live counter ("3 lines · 34 chars wide at worst — nice and short")
near the preview. Personal signatures should be short; this teaches the norm
without blocking anything.

## Tier 3 — bigger or optional

**12. "Photo card" template** *(medium)* — photo left, bold first name, a
one-liner, socials row; a 10th template tuned purely for personal profiles.
**13. Portfolio vs website split** *(small)* — separate portfolio link field
rendered as its own line/chip for creators; shop link for makers.
**14. vCard 4.0 with PRONOUN** *(small)* — 4.0's PRONOUN property is read by
modern contacts apps; emit it alongside the 3.0 card.
**15. Bookmarklet** *(small–medium)* — a "Copy my signature" bookmarklet so
repeat copying is one click without opening the app; pairs with the PWA.
**16. Multiple aliases** *(small)* — allow several From-addresses per
signature so one card covers side projects without extra snapshots.
**17. i18n** *(large)* — German first. Matters once personal users outside
the English-speaking bubble arrive; needs the string-extraction pass.
**18. Public Forgejo Pages demo** *(needs Zoey's decision, carried over)* —
personal users won't self-host; a live URL is the single biggest adoption
unlock. Repo must be public.

## Explicitly out of scope (for personal use)

- Team features: preset sharing already exists; approval workflows, CMS, and
  multi-user sync don't serve individuals and would break the local-first
  privacy model.
- Image hosting: hosted URLs remain the user's own responsibility — correct
  for email clients, and personal users' existing hosting (GitHub, Dropbox,
  personal site) already covers it.
- Emoji in signatures: client rendering is too inconsistent; text glyphs
  stay.

## Suggested batch order

1. **v0.5.0 "personal pack"**: themes (1) + networks (2) + status badge (3) +
   identity fields (4) + booking link (5) — all independent, one release.
2. **v0.6.0 "guidance pack"**: wizard (6) + personas (7) + quick-switch (8) +
   conciseness hint (11).
3. **v0.7.0 "flair pack"**: card style (9) + round photo (10) + photo-card
   template (12) + portfolio split (13).
4. Then: bookmarklet (15), vCard 4.0 (14), aliases (16), i18n (17), Pages
   demo (18) as decided.
