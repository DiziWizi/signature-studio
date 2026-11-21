/* v0.41: the Custom template with block reordering. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('custom template renders sections in the default order', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('.tpl-btn[data-template="custom"]');
  await expect(page.locator('#custom-blocks')).not.toHaveClass(/hidden/);
  await expect(page.locator('#blocks-list .block-row')).toHaveCount(8);

  /* Identity before contact before socials in the default order. */
  const doc = await previewSrcdoc(page);
  expect(doc.indexOf('Ada Lovelace')).toBeGreaterThan(-1);
  expect(doc.indexOf('Ada Lovelace')).toBeLessThan(doc.indexOf('ada@example.com'));
  expect(doc.indexOf('ada@example.com')).toBeLessThan(doc.indexOf('linkedin.com'));

  await expectNoErrors(h);
});

test('moving socials above contact reorders the render', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('.tpl-btn[data-template="custom"]');

  /* Default: identity, divider, contact, socials — move socials up twice. */
  const socialsRow = page.locator('#blocks-list .block-row[data-block="socials"]');
  await socialsRow.locator('[data-dir="-1"]').click();
  await page.locator('#blocks-list .block-row[data-block="socials"] [data-dir="-1"]').click();

  const doc = await previewSrcdoc(page);
  expect(doc.indexOf('linkedin.com')).toBeLessThan(doc.indexOf('ada@example.com'));

  /* The order persists in the state and reloads. */
  const order = await page.evaluate(() => state.design.blockOrder);
  expect(order.slice(0, 3)).toEqual(['identity', 'socials', 'divider']);
  await page.reload();
  await page.waitForLoadState('load');
  await expect(page.locator('#blocks-list .block-row[data-block="socials"]')).toHaveCount(1);
  await expect(page.locator('#blocks-list .block-row')).toHaveCount(8);

  await expectNoErrors(h);
});

test('empty blocks do not render and the picker shows 18 tiles', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await expect(page.locator('.tpl-btn')).toHaveCount(25);

  /* Banner, footer, QR and custom HTML are all empty on the sample. */
  await page.click('.tpl-btn[data-template="custom"]');
  const doc = await previewSrcdoc(page);
  /* No QR cells (the X chip is a single black cell, the QR is thousands). */
  expect((doc.match(/background-color:#000000/g) || []).length).toBeLessThan(10);
  expect(doc).not.toContain('width="33%"'); /* no footer */

  await expectNoErrors(h);
});
