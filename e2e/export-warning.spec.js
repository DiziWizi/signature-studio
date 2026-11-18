/* Export-time Outlook warning: HTML exports are intercepted when the
   signature carries rounded corners that Word-engine Outlook squares off. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8137',
  });
});

async function openExportMenu(page) {
  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
}

test('copy warns about rounded corners and Export anyway keeps them', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada: social chips → rounded corners */

  await openExportMenu(page);
  await page.click('#x-copy');
  await expect(page.locator('#modal-outlook')).not.toHaveClass(/hidden/);
  await expect(page.locator('#outlook-issues')).toContainText('social chips');

  await page.click('#outlook-anyway');
  await expect(page.locator('#modal-outlook')).toHaveClass(/hidden/);
  await expect(page.locator('#toasts')).toContainText('Copied');
  expect(await page.evaluate(() => state.design.strictOutlook)).toBe(false);

  await expectNoErrors(h);
});

test('Use strict mode & export applies strict and skips the warning next time', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await openExportMenu(page);
  await page.click('#x-copy');
  await expect(page.locator('#modal-outlook')).not.toHaveClass(/hidden/);

  await page.click('#outlook-strict');
  await expect(page.locator('#modal-outlook')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => state.design.strictOutlook)).toBe(true);
  await expect(page.locator('[data-field="design.strictOutlook"]')).toBeChecked();
  await expect(page.locator('#toasts')).toContainText('Copied');

  /* Strict is on now — the next export goes straight through. */
  await openExportMenu(page);
  await page.click('#x-copy');
  await expect(page.locator('#modal-outlook')).toHaveClass(/hidden/);

  await expectNoErrors(h);
});

test('no warning when strict mode is already on', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.locator('label.switch:has(input[data-field="design.strictOutlook"])').click();

  await openExportMenu(page);
  await page.click('#x-copy');
  await expect(page.locator('#modal-outlook')).toHaveClass(/hidden/);
  await expect(page.locator('#toasts')).toContainText('Copied');

  await expectNoErrors(h);
});

test('download warns too, and Cancel aborts the export', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await openExportMenu(page);
  await page.click('#x-download');
  await expect(page.locator('#modal-outlook')).not.toHaveClass(/hidden/);

  await page.click('#modal-outlook [data-close]');
  await expect(page.locator('#modal-outlook')).toHaveClass(/hidden/);

  /* No stray download and no export toast after cancel. */
  await expect(page.locator('#toasts')).not.toContainText('Downloading');

  await expectNoErrors(h);
});
