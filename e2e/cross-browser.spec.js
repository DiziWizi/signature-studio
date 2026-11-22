/* v0.87: cross-browser smoke — the flows that must work in Safari and
   Firefox, not just Chromium. Deliberately avoids clipboard APIs (permission
   models differ) and screenshots (baselines are Chromium-only). */
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

test('boots and renders the sample signature', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await expect.poll(() => previewSrcdoc(page)).toContain('Ada Lovelace');
  const fields = await page.locator('[data-field]').count();
  expect(fields).toBeGreaterThan(50);
  await expectNoErrors(h);
});

test('switching template changes the rendered signature', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('.tpl-btn[data-template="centered"]');
  await expect.poll(() => page.evaluate(() => state.design.template)).toBe('centered');
  const html = await page.evaluate(() => renderSignature(state));
  expect(html).toContain('align="center"');
  await expectNoErrors(h);
});

test('exports a self-contained HTML file', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Strict mode avoids the Outlook rounding dialogue on the export path. */
  await page.evaluate(() => {
    state.design.strictOutlook = true;
    renderPreview();
  });
  await page.click('#btn-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#x-download')]);
  const html = fs.readFileSync(await download.path(), 'utf8');
  expect(html).toContain('<table');
  expect(html).toContain('Ada Lovelace');
  await expectNoErrors(h);
});
