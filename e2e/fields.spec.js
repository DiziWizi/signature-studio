/* v0.18: honorifics, PGP key, privacy networks, vCard photo + key. */
'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test.use({ acceptDownloads: true });

async function openExportMenu(page) {
  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
}

test('honorifics render around the name in the preview', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada Lovelace */

  await page.fill('[data-field="profile.honorificPrefix"]', 'Dr.');
  await page.fill('[data-field="profile.honorificSuffix"]', 'PhD');
  await expect.poll(() => previewSrcdoc(page)).toContain('Dr. Ada Lovelace, PhD');

  /* Clearing both restores the plain name. */
  await page.fill('[data-field="profile.honorificPrefix"]', '');
  await page.fill('[data-field="profile.honorificSuffix"]', '');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('Dr. Ada');

  await expectNoErrors(h);
});

test('a PGP fingerprint renders a truncated PGP line; a URL renders a link', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="contact.pgpKey"]', 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234');
  let doc = await previewSrcdoc(page);
  expect(doc).toContain('PGP');
  expect(doc).toContain('ABCDEF1234567890ABCDEF12…'); /* ≤24 chars + ellipsis */
  expect(doc).not.toContain('7890ABCDEF1234'); /* tail truncated */

  await page.fill('[data-field="contact.pgpKey"]', 'https://keys.example/ada.asc');
  doc = await previewSrcdoc(page);
  expect(doc).toContain('Public key');
  expect(doc).toContain('https://keys.example/ada.asc');

  await expectNoErrors(h);
});

test('vCards carry honorifics, a hosted photo and the PGP key', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="profile.honorificPrefix"]', 'Dr.');
  await page.fill('[data-field="profile.honorificSuffix"]', 'PhD');
  /* A real, always-loadable image URL so the preview iframe makes no
     failed-request console noise. */
  const PHOTO = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?s=64&d=identicon';
  await page.fill('[data-field="design.logoUrl"]', PHOTO);
  await page.fill('[data-field="contact.pgpKey"]', '0x1234ABCD');

  await openExportMenu(page);
  const [v3] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-vcard'),
  ]);
  const v3text = fs.readFileSync(await v3.path(), 'utf8');
  const v3unfolded = v3text.replace(/\r?\n /g, ''); /* undo RFC 2426 folding */
  expect(v3text).toContain('N:Lovelace;Ada;;Dr.;PhD');
  expect(v3unfolded).toContain(`PHOTO;VALUE=URI:${PHOTO}`);
  expect(v3unfolded).toContain('KEY;TYPE=PGP:0x1234ABCD');

  await openExportMenu(page);
  const [v4] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-vcard4'),
  ]);
  const v4text = fs.readFileSync(await v4.path(), 'utf8');
  expect(v4text).toContain('HONORIFIC-PREFIX:Dr.');
  expect(v4text).toContain('HONORIFIC-SUFFIX:PhD');
  expect(v4text).toContain(`PHOTO:${PHOTO}`);
  expect(v4text).toContain('KEY;TYPE=PGP:0x1234ABCD');

  await expectNoErrors(h);
});

test('new privacy networks are available in the picker and render', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#add-social');
  const row = page.locator('.social-row').last();
  const options = await row.locator('.soc-net option').evaluateAll(els => els.map(e => e.value));
  for (const net of ['matrix', 'keybase', 'threads']) {
    expect(options, `network ${net} present`).toContain(net);
  }

  await row.locator('.soc-net').selectOption('matrix');
  await row.locator('.soc-url').fill('https://matrix.to/#/@ada:example.org');
  await expect.poll(() => previewSrcdoc(page)).toContain('matrix.to');

  await expectNoErrors(h);
});

test('payment networks are available and render their chips', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#add-social');
  const row = page.locator('.social-row').last();
  const options = await row.locator('.soc-net option').evaluateAll(els => els.map(e => e.value));
  for (const net of ['paypal', 'venmo', 'cashapp', 'revolut', 'monzo']) {
    expect(options, `network ${net} present`).toContain(net);
  }

  await row.locator('.soc-net').selectOption('paypal');
  await row.locator('.soc-url').fill('paypal.me/ada');
  await expect.poll(() => previewSrcdoc(page)).toContain('paypal.me/ada');

  await expectNoErrors(h);
});
