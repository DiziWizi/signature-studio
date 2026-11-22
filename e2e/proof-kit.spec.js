/* v0.93: client proof kit — a real .eml, a checklist, BIMI honesty, and
   Word-engine-safe social chips. */
'use strict';
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

function decodePart(eml, header) {
  const start = eml.indexOf(header);
  if (start < 0) return '';
  const bodyStart = eml.indexOf('\r\n\r\n', start);
  const next = eml.indexOf('\r\n--', bodyStart + 4);
  const b64 = eml.slice(bodyStart + 4, next < 0 ? undefined : next).replace(/\s+/g, '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

test('the checklist is readable and copyable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-test');
  await expect(page.locator('#modal-test')).not.toHaveClass(/hidden/);
  const checklist = await page.locator('#test-checklist').textContent();
  expect(checklist).toContain('Images');
  expect(checklist).toContain('Dark mode');
  expect(checklist).toContain('Sender');
  await page.click('#test-copy');
  await expect(page.locator('#toasts')).toContainText(/Checklist copied/i);
  await expectNoErrors(h);
});

test('the test email is a real multipart message with inline images', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-export');
  await page.click('#x-test');

  /* A data-URI logo must travel as a related part. */
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const x = c.getContext('2d');
    x.fillStyle = '#c33'; x.fillRect(0, 0, 48, 48);
    state.design.logoUrl = c.toDataURL('image/png');
    renderPreview();
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#test-download'),
  ]);
  const file = await download.path();
  const eml = fs.readFileSync(file, 'utf8');

  expect(eml).toContain('MIME-Version: 1.0');
  expect(eml).toContain('multipart/alternative');
  expect(eml).toMatch(/Subject: =\?UTF-8\?B\?/);
  expect(eml).toContain('multipart/related');
  expect(eml).toContain('Content-ID: <sigstudio-logo>');

  const text = decodePart(eml, 'Content-Type: text/plain');
  expect(text).toContain('Check in each client');
  const html = decodePart(eml, 'Content-Type: text/html');
  expect(html).toContain('cid:sigstudio-logo');
  expect(html).toContain('Ada Lovelace');
  expect(html).not.toContain('data:image/png;base64');
  await expectNoErrors(h);
});

test('without an address the download explains what is missing', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => { state.profile.email = ''; state.contact.email = ''; });
  await page.click('#btn-export');
  await page.click('#x-test');
  await page.click('#test-download');
  await expect(page.locator('#toasts')).toContainText(/Add your email address/i);
  await expectNoErrors(h);
});

test('BIMI says plainly that mailbox.org cannot do this', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => openBimi());
  await page.fill('#bimi-domain', 'mailbox.org');
  await expect(page.locator('#bimi-domain-hint')).not.toHaveClass(/hidden/);
  await expect(page.locator('#bimi-domain-hint')).toContainText(/cannot publish BIMI/i);
  await page.fill('#bimi-domain', 'dizi.dev');
  await expect(page.locator('#bimi-domain-hint')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('social chips are table cells with letters Outlook can render', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const html = await previewSrcdoc(page);
  expect(html).toContain('<td width="22" height="22"');
  expect(html).toContain('bgcolor="#0a66c2"');
  expect(html).toContain('>in</a>');
  expect(html).toContain('>X</a>');
  expect(html).not.toContain('𝕏');
  expect(html).not.toMatch(/<span style="display:inline-block;width:22px;height:22px/);
  await expectNoErrors(h);
});
