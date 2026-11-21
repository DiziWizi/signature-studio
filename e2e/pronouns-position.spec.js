/* v0.55: pronouns position — default stays inline after the name
   (byte-identical), 'Under the name' moves them onto their own line in a
   slightly smaller size. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('pronouns default to inline after the name', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const doc = await previewSrcdoc(page);
  /* Ada's sample has pronouns 'she/her' — inline, one space, then a span. */
  expect(doc).toMatch(/Ada Lovelace<\/span> <span[^>]*>\(she\/her\)<\/span>/);
  /* No line break between the name and its pronouns. */
  expect(doc).not.toMatch(/Ada Lovelace<\/span><br><span[^>]*>\(she\/her\)/);

  await expectNoErrors(h);
});

test('underName places pronouns on their own line, slightly smaller', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('[data-field="design.pronounsPosition"][value="underName"]');
  await expect.poll(() => previewSrcdoc(page))
    .toMatch(/Ada Lovelace<\/span><br><span[^>]*>\(she\/her\)<\/span>/);

  const doc = await previewSrcdoc(page);
  /* The pronouns line is 4px smaller than the name (3 inline → 4 under). */
  const nameSize = Number(doc.match(/font-size:(\d+)px[^>]*>Ada Lovelace/)[1]);
  const pnSize = Number(doc.match(/<span[^>]*font-size:(\d+)px[^>]*>\(she\/her\)/)[1]);
  expect(nameSize - pnSize).toBe(4);

  /* Switching back restores the inline form. */
  await page.click('[data-field="design.pronounsPosition"][value=""]');
  await expect.poll(() => previewSrcdoc(page))
    .toMatch(/Ada Lovelace<\/span> <span[^>]*>\(she\/her\)<\/span>/);

  await expectNoErrors(h);
});

test('night light-name honours the underName pronouns position', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('[data-template="night"]');
  await page.click('[data-field="design.pronounsPosition"][value="underName"]');

  await expect.poll(() => previewSrcdoc(page))
    .toMatch(/Ada Lovelace<\/span><br><span[^>]*>\(she\/her\)<\/span>/);

  await expectNoErrors(h);
});
