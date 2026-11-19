/* v0.26: social chip size, chip alt text, signature background. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

test('social icon size slider resizes the chips', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada: 3 glyph chips */

  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.socialSize"]');
    el.value = '28';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => previewSrcdoc(page)).toContain('width:28px;height:28px');
  await expect(page.locator('#social-size-out')).toHaveText('28 px');

  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.socialSize"]');
    el.value = '16';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => previewSrcdoc(page)).toContain('width:16px;height:16px');

  await expectNoErrors(h);
});

test('icon-image chips carry the network name as alt text', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Ada's LinkedIn chip: switch to an image icon. */
  await page.click('#add-social');
  const row = page.locator('.social-row').last();
  await row.locator('.soc-url').fill('https://linkedin.com/in/ada-test');
  await row.locator('.soc-img').click();
  await row.locator('.soc-icon-url').fill(DATA_URI);
  await expect.poll(() => previewSrcdoc(page)).toContain('alt="LinkedIn"');

  await expectNoErrors(h);
});

test('signature background colour paints the outer band', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.background"]', '#f0f2f5');
  await expect.poll(() => previewSrcdoc(page)).toContain('background-color:#f0f2f5');

  /* Invalid values are ignored. */
  await page.fill('[data-field="design.background"]', 'red');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('background-color:red');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('background-color:#f0f2f5');

  await expectNoErrors(h);
});
