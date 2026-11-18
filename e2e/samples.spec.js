/* #btn-sample cycles through every persona and wraps around.
   The editor field mirrors state; the preview srcdoc reflects the shown
   (display) name for the current persona. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

/* Personas in cycle order; `shown` is what the signature actually displays
   (displayName wins over name in the renderer). */
const PERSONAS = [
  { full: 'Ada Lovelace', shown: 'Ada Lovelace' },
  { full: 'Maya Chen', shown: 'Maya' },
  { full: 'Jonas Lindqvist', shown: 'Jonas' },
  { full: 'Priya Nair', shown: 'Priya' },
  { full: 'Sam Okafor', shown: 'Sam' },
];

test('#btn-sample cycles all personas and wraps to the first', async ({ page }) => {
  const h = await freshPage(page);

  /* One extra click to verify wrap-around back to Ada. */
  for (let i = 0; i <= PERSONAS.length; i++) {
    const p = PERSONAS[i % PERSONAS.length];
    await page.click('#btn-sample');
    await expect(page.locator('[data-field="profile.name"]')).toHaveValue(p.full);
    await expect.poll(() => previewSrcdoc(page)).toContain(p.shown);
    /* The previous persona's display name must be gone from the render. */
    if (i > 0) {
      const prev = PERSONAS[(i - 1) % PERSONAS.length];
      if (prev.shown !== p.shown) {
        await expect.poll(() => previewSrcdoc(page)).not.toContain(prev.shown);
      }
    }
  }

  await expectNoErrors(h);
});
