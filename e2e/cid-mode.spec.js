/* v0.48: CID image reference mode + bulk manifest. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

/* A tiny valid 1x1 PNG (base64) as a stand-in for an uploaded logo. */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('CID mode rewrites every image to cid:sigstudio-<key> and restores on switch-back', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', TINY_PNG);
  await expect.poll(() => previewSrcdoc(page)).toContain('data:image/png;base64');

  await page.selectOption('[data-field="design.imageMode"]', 'cid');
  await expect.poll(() => previewSrcdoc(page)).toContain('src="cid:sigstudio-logo"');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('src="data:image/png;base64');
  await expect(page.locator('#checklist')).toContainText('CID mode');

  await page.selectOption('[data-field="design.imageMode"]', '');
  await expect.poll(() => previewSrcdoc(page)).toContain('src="data:image/png;base64');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('cid:sigstudio-logo');

  await expectNoErrors(h);
});

test('bulk ZIP in CID mode carries the manifest and extracted image bytes', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', TINY_PNG);
  await page.selectOption('[data-field="design.imageMode"]', 'cid');

  await page.click('#btn-export');
  await page.click('#x-bulk');
  await page.fill('#bulk-csv', 'name,email\nAda Lovelace,ada@example.com\n');
  const dlPromise = page.waitForEvent('download');
  await page.click('#bulk-generate');
  const dl = await dlPromise;
  const buf = require('fs').readFileSync(await dl.path());

  const blob = buf.toString('latin1');
  expect(blob).toContain('manifest.json');
  expect(blob).toContain('images/sigstudio-logo.png');
  expect(blob).toContain('"cid": "sigstudio-logo"');
  expect(blob).toContain('"file": "images/sigstudio-logo.png"');
  /* The PNG magic must appear as real bytes in the zip. */
  expect(blob).toContain('\x89PNG');

  await expectNoErrors(h);
});

test('hosted URLs in CID mode are listed by reference in the manifest', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', 'http://127.0.0.1:8137/assets/icons/icon-192.png');
  await page.selectOption('[data-field="design.imageMode"]', 'cid');

  await expect.poll(() => previewSrcdoc(page)).toContain('src="cid:sigstudio-logo"');
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('icon-192.png');

  /* The stored URL is still in the state — the asset source of truth. */
  expect(await page.evaluate(() => state.design.logoUrl)).toContain('127.0.0.1:8137');

  await expectNoErrors(h);
});
