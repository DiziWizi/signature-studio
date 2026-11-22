/* v0.84: export-all backup, second-language block, receiver guide. */
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

test('the backup ZIP holds the draft, every saved signature and an index', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-saved');
  await page.fill('#save-name', 'External');
  await page.click('#save-now');
  await page.fill('#save-name', 'Internal');
  await page.click('#save-now');
  await page.click('#saved-close');

  const files = await page.evaluate(async () => (await backupFiles()).map(f => f.name));
  expect(files).toContain('draft.json');
  expect(files).toContain('backup.json');
  expect(files).toContain('README.txt');
  expect(files.filter(n => n.startsWith('saved/'))).toHaveLength(2);

  await page.click('#btn-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#x-backup')]);
  expect(download.suggestedFilename()).toMatch(/^signature-studio-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(fs.statSync(await download.path()).size).toBeGreaterThan(500);
  await expectNoErrors(h);
});

test('a second-language block renders under the tagline in the HTML and text', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.altLabel"]', 'Français');
  await page.fill('[data-field="design.altBlock"]', 'Conseil en données\nNous parlons français.');
  await expect.poll(() => page.evaluate(() => renderSignature(state))).toContain('Conseil en données');

  const html = await page.evaluate(() => renderSignature(state));
  expect(html).toContain('Français');
  expect(html).toMatch(/Conseil en données<br>Nous parlons français\./);

  const text = await page.evaluate(() => plainTextSignature(state));
  expect(text).toContain('Français');
  expect(text).toContain('Nous parlons français.');
  await expectNoErrors(h);
});

test('the receiver guide explains the parts a signature cannot set', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-receiver-guide');
  await expect(page.locator('#modal-receiver-guide')).not.toHaveClass(/hidden/);
  await expect(page.locator('#modal-receiver-guide .rg-list section')).toHaveCount(6);
  await expect(page.locator('#modal-receiver-guide')).toContainText(/Microsoft does not display it/i);
  await expect(page.locator('#modal-receiver-guide')).toContainText(/102 KB/);
  await page.click('#modal-receiver-guide [data-close]');
  await expect(page.locator('#modal-receiver-guide')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});
