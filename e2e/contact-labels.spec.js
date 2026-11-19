/* v0.20: secondary email + configurable contact labels. */
'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test.use({ acceptDownloads: true });

async function toggle(page, field) {
  await page.locator(`label.switch:has(input[data-field="${field}"])`).click();
}

test('secondary email renders in the signature, plain text and both vCards', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="contact.email2"]', 'ada.personal@example.com');
  await expect.poll(() => previewSrcdoc(page)).toContain('ada.personal@example.com');
  await expect.poll(() => previewSrcdoc(page)).toContain('Email 2');

  /* showEmail off hides BOTH email items. */
  await toggle(page, 'design.showEmail');
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('ada@example.com');
  expect(doc).not.toContain('ada.personal@example.com');

  await toggle(page, 'design.showEmail');
  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
  const [v3] = await Promise.all([page.waitForEvent('download'), page.click('#x-vcard')]);
  const v3text = fs.readFileSync(await v3.path(), 'utf8').replace(/\r?\n /g, '');
  expect(v3text.match(/EMAIL;TYPE=INTERNET:/g)).toHaveLength(2);
  expect(v3text).toContain('EMAIL;TYPE=INTERNET:ada.personal@example.com');

  await expectNoErrors(h);
});

test('custom contact labels replace the defaults in the signature', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada: phone + mobile set */

  await page.fill('[data-field="contact.phoneLabel"]', 'Direct line');
  await expect.poll(() => previewSrcdoc(page)).toContain('Direct line:');

  /* Labels off → label gone, number still there. */
  await toggle(page, 'design.showLabels');
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('Direct line:');
  expect(doc).toContain('+44 20 7946 0958');

  /* Empty label falls back to the default. */
  await toggle(page, 'design.showLabels');
  await page.fill('[data-field="contact.phoneLabel"]', '');
  await expect.poll(() => previewSrcdoc(page)).toContain('Phone:');

  await expectNoErrors(h);
});
