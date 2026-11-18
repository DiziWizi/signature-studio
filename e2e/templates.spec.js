/* One test per template: click the tile, assert a marker substring that is
   unique/stable for that template in the preview srcdoc.

   Markers are derived from assets/js/templates.js (renderer internals) and
   verified against real output. Several layouts share rendering code, so the
   unique marker is sometimes the absence of every other layout's signature
   string (`not` list) combined with a positive content check. State setup
   per template: Ada sample data (via #btn-sample), plus a data: bannerUrl or
   logoUrl where the template's distinguishing feature needs one. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

const MARKERS = {
  /* classicRows(left): m-cell identity cell, no other layout's signature. */
  classic: {
    has: ['valign="middle" align="left"'],
    not: ['align="right"', 'valign="top"', 'align="center"', 'padding:12px 16px',
      'background-color:#f6f8fa', 'alt="banner"'],
  },
  /* classicRows(center) — only the centered layout centers its middle cell. */
  centered: {
    has: ['valign="middle" align="center"'],
  },
  /* compactRows: right-aligned contact cell, small name (big:false → 15px). */
  compact: {
    has: ['align="right"', 'font-size:15px'],
  },
  /* bannerRows: renders the banner <img> above the classic rows. */
  banner: {
    setup: 'banner',
    has: ['alt="banner"'],
    not: ['background-color:#f6f8fa'],
  },
  /* minimalRows: no labels, no divider, no special cell markup at all. */
  minimal: {
    has: ['mailto:ada@example.com'],
    not: ['align="right"', 'valign="top"', 'align="center"', 'valign="middle"',
      'Email: ', 'padding:12px 16px', 'background-color:#f6f8fa',
      'border-radius:50%', 'alt="banner"', 'border-top:1px'],
  },
  /* splitRows: the bordered contact card. */
  split: {
    has: ['background-color:#f6f8fa;border:1px solid'],
  },
  /* roundelRows: the centered logo image is force-circled (border-radius:50%
     on an <img>, which no other layout emits — monogram emits a circle span,
     never an <img>). */
  roundel: {
    setup: 'logo',
    has: ['alt="logo"', 'border-radius:50%'],
    not: ['valign="middle"'],
  },
  /* mastheadRows: the coloured brand band row. */
  masthead: {
    has: ['padding:12px 16px', 'Analytical Engines Ltd'],
  },
  /* monogramRows: always renders the initials circle span, even without any
     image/logo (useMonogram=false) — unique among the other layouts. */
  monogram: {
    has: ['border-radius:50%'],
    not: ['alt="logo"', 'valign="middle"'],
  },
  /* photocardRows: only layout with top-aligned (valign="top") cells. */
  photocard: {
    has: ['valign="top"'],
  },
};

for (const [template, marker] of Object.entries(MARKERS)) {
  test(`template ${template} renders its distinctive marker`, async ({ page }) => {
    const h = await freshPage(page);

    /* Ada sample: name, company, contacts and socials for rich output. */
    await page.click('#btn-sample');
    await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Ada Lovelace');

    if (marker.setup === 'banner') {
      await page.fill('[data-field="design.bannerUrl"]', DATA_URI);
    } else if (marker.setup === 'logo') {
      await page.fill('[data-field="design.logoUrl"]', DATA_URI);
    }

    await page.click(`.tpl-btn[data-template="${template}"]`);
    await expect(page.locator(`.tpl-btn[data-template="${template}"]`))
      .toHaveAttribute('aria-pressed', 'true');

    /* renderPreview assigns the srcdoc atomically, so once the first `has`
       marker is present the whole condition can be checked synchronously. */
    const firstHas = (marker.has || [])[0];
    let srcdoc = '';
    await expect
      .poll(async () => (srcdoc = await previewSrcdoc(page)), { message: `template ${template} marker` })
      .toContain(firstHas);
    expect(
      (marker.has || []).every(s => srcdoc.includes(s)) &&
        (marker.not || []).every(s => !srcdoc.includes(s)),
      `template ${template} marker check on:\n${srcdoc.slice(0, 500)}`
    ).toBe(true);

    await expectNoErrors(h);
  });
}
