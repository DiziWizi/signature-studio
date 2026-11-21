/* v0.25: divider length/position + Night/Letterhead smoke. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('divider position belowContact moves the rule under the contact details', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* classic template */

  /* Default: rule right after the identity block (before contact). */
  let doc = await previewSrcdoc(page);
  expect(doc.indexOf('border-top:1px')).toBeLessThan(doc.indexOf('ada@example.com'));

  await page.selectOption('[data-field="design.dividerPosition"]', 'belowContact');
  await expect.poll(async () => {
    const cur = await previewSrcdoc(page);
    return cur.indexOf('ada@example.com') < cur.indexOf('border-top:1px');
  }).toBe(true);

  await expectNoErrors(h);
});

test('short divider renders a 60px nested rule', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.selectOption('[data-field="design.dividerLength"]', 'short');
  await expect.poll(() => previewSrcdoc(page)).toContain('width="60"');

  await page.selectOption('[data-field="design.dividerLength"]', 'full');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('width="60"');

  await expectNoErrors(h);
});

test('Night template renders a dark wrapper with the name in light text', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('.tpl-btn[data-template="night"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('background-color:#171a21');
  await expect.poll(() => previewSrcdoc(page)).toContain('Ada Lovelace');

  await expectNoErrors(h);
});
