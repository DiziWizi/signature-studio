/* Export paths: clipboard (rich HTML), .html download, vCard 3.0 / 4.0
   downloads, QR modal. All use the Ada sample for predictable content. */
'use strict';

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8137',
  });
});

async function openExportMenu(page) {
  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
}

test('#x-copy puts rich HTML on the clipboard', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Ada Lovelace');
  /* Strict mode on: export mechanics are under test here — the Outlook
     warning gate has its own spec (export-warning.spec.js). */
  await page.locator('label.switch:has(input[data-field="design.strictOutlook"])').click();

  await openExportMenu(page);
  await page.click('#x-copy');
  await expect(page.locator('#toasts')).toContainText('Copied');

  let clipHtml = '';
  await expect
    .poll(async () => {
      clipHtml = await page.evaluate(async () => {
        try {
          const items = await navigator.clipboard.read();
          const item = items.find(i => i.types.includes('text/html'));
          return item ? (await item.getType('text/html')).text() : '';
        } catch (e) {
          return '';
        }
      });
      return clipHtml;
    }, { timeout: 15_000 })
    .toContain('Ada Lovelace');

  expect(clipHtml).toContain('<table');
  expect(clipHtml).toContain('ada@example.com');
  await expectNoErrors(h);
});

test('#x-download yields an .html file containing the name', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Strict mode on: see the copy test above. */
  await page.locator('label.switch:has(input[data-field="design.strictOutlook"])').click();

  await openExportMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-download'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const body = fs.readFileSync(await download.path(), 'utf8');
  expect(body).toContain('Ada Lovelace');
  expect(body).toContain('<table');
  await expectNoErrors(h);
});

test('#x-vcard downloads a 3.0 vCard; #x-vcard4 a 4.0 vCard with PRONOUN', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Ada sample has pronouns she/her. */
  await expect(page.locator('[data-field="profile.pronouns"]')).toHaveValue('she/her');

  await openExportMenu(page);
  const [v3] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-vcard'),
  ]);
  expect(v3.suggestedFilename()).toMatch(/\.vcf$/);
  const v3text = fs.readFileSync(await v3.path(), 'utf8');
  expect(v3text).toContain('BEGIN:VCARD');
  expect(v3text).toContain('VERSION:3.0');
  expect(v3text).toContain('END:VCARD');

  await openExportMenu(page);
  const [v4] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-vcard4'),
  ]);
  expect(v4.suggestedFilename()).toMatch(/\.vcf$/);
  const v4text = fs.readFileSync(await v4.path(), 'utf8');
  expect(v4text).toContain('BEGIN:VCARD');
  expect(v4text).toContain('VERSION:4.0');
  expect(v4text).toContain('PRONOUN:she/her');
  expect(v4text).toContain('END:VCARD');
  await expectNoErrors(h);
});

test('#x-qr opens the QR modal with a rendered (non-blank) canvas', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await openExportMenu(page);
  await page.click('#x-qr');
  await expect(page.locator('#modal-qr')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qr-caption')).toContainText('Ada Lovelace');

  const hasInk = await page.evaluate(() => {
    const canvas = document.getElementById('qr-canvas');
    if (!canvas || canvas.width !== 264 || canvas.height !== 264) return false;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128) return true; /* dark module */
    }
    return false;
  });
  expect(hasInk).toBe(true);
  await expectNoErrors(h);
});
