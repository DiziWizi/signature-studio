/* v0.95: backup health — age, verification, and an honest nudge. */
'use strict';
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

async function denyPersistence(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(false),
      },
    });
  });
}

test('without a backup, the Saved panel says so and offers one', async ({ page }) => {
  await denyPersistence(page);
  const h = await freshPage(page);
  await page.click('#btn-saved');
  await expect(page.locator('#backup-age')).toContainText(/No backup yet/i);
  await expect(page.locator('#backup-nudge')).not.toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('backing up verifies the archive before download and records the date', async ({ page }) => {
  await denyPersistence(page);
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-saved');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#backup-now'),
  ]);
  const buf = fs.readFileSync(await download.path());
  const names = await page.evaluate(b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return unzipStore(bytes).map(e => e.name);
  }, buf.toString('base64'));
  expect(names).toContain('draft.json');
  expect(names).toContain('backup.json');

  await expect(page.locator('#backup-age')).toContainText(/today/i);
  await expect(page.locator('#backup-nudge')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('the nudge stays away once storage is persistent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(true),
        persist: () => Promise.resolve(true),
      },
    });
  });
  const h = await freshPage(page);
  await page.click('#btn-saved');
  await expect(page.locator('#backup-nudge')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});
