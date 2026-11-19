/* v0.40: fine-tuning (spacing/alignment/card) with auto defaults. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('spacing overrides apply and clear back to auto', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.rowGap"]', '24');
  /* Spacers are the only elements with a height attribute. */
  await expect.poll(async () => {
    const doc = await previewSrcdoc(page);
    const m = doc.match(/<td colspan="\d+" height="24"/);
    return m ? m[0] : '';
  }).toContain('height="24"');

  await page.fill('[data-field="design.lineHeight"]', '2');
  await expect.poll(() => previewSrcdoc(page)).toContain('line-height:38px'); /* 19px name × 2 */

  /* Clearing restores the preset. */
  await page.fill('[data-field="design.rowGap"]', '');
  await page.fill('[data-field="design.lineHeight"]', '');
  await expect.poll(() => previewSrcdoc(page)).toContain('line-height:29px'); /* 19 × 1.5 */

  await expectNoErrors(h);
});

test('global text alignment overrides the layout default', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Classic defaults to left. */
  await expect.poll(() => previewSrcdoc(page)).toContain('<td align="left"');

  await page.selectOption('[data-field="design.textAlign"]', 'center');
  await expect.poll(() => previewSrcdoc(page)).toContain('<td align="center"');

  /* And the centered template stays centered under 'auto'. */
  await page.selectOption('[data-field="design.textAlign"]', '');
  await page.click('.tpl-btn[data-template="centered"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('<td align="center"');

  await expectNoErrors(h);
});

test('card padding and border width apply', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.locator('label.switch:has(input[data-field="design.showCard"])').click();
  await expect.poll(() => previewSrcdoc(page)).toContain('padding:16px 18px');

  await page.fill('[data-field="design.cardPadding"]', '24');
  await page.fill('[data-field="design.cardBorderWidth"]', '3');
  const doc = await previewSrcdoc(page);
  expect(doc).toContain('padding:24px');
  expect(doc).toContain('border:3px solid');

  await expectNoErrors(h);
});
