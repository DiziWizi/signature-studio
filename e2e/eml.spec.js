/* v0.89: .eml import through the existing signature importer. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const EML_QP = [
  'From: Ada Lovelace <ada@example.com>',
  'To: someone@example.com',
  'Subject: My signature',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Ada Lovelace',
  'Head of Analytics',
  '',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<table><tr><td><b>Ada Lovelace</b><br>Head of Analytics<br>Analytical Engines Ltd<br>ada@example.com</td></tr></table>',
  '',
  '--b1--',
  '',
].join('\r\n');

function base64Eml(html) {
  return [
    'From: Grace Hopper <grace@example.com>',
    'Subject: Base64 signature',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
}

test('a quoted-printable multipart .eml feeds the importer', async ({ page }) => {
  const h = await freshPage(page);
  await page.setInputFiles('#eml-file', {
    name: 'signature.eml', mimeType: 'message/rfc822', buffer: Buffer.from(EML_QP),
  });
  await expect(page.locator('#modal-import')).not.toHaveClass(/hidden/);
  await expect(page.locator('#import-src')).toHaveValue(/Ada Lovelace/);
  await expect(page.locator('#import-summary')).not.toHaveClass(/hidden/);

  await page.click('#import-apply');
  await expect.poll(() => page.evaluate(() => state.profile.name)).toContain('Ada');
  await expect.poll(() => page.evaluate(() => state.contact.email)).toBe('ada@example.com');
  await expectNoErrors(h);
});

test('a base64 single-part .eml decodes to HTML', async ({ page }) => {
  const h = await freshPage(page);
  const html = '<table><tr><td><b>Grace Hopper</b><br>Admiral<br>grace@example.com</td></tr></table>';
  const parsed = await page.evaluate(eml => parseEml(eml), base64Eml(html));
  expect(parsed.html).toContain('Grace Hopper');
  expect(parsed.html).not.toContain('Content-Transfer-Encoding');
  await expectNoErrors(h);
});

test('quoted-printable soft breaks and escapes survive', async ({ page }) => {
  const h = await freshPage(page);
  const eml = [
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<p>Caf=C3=A9 =E2=80=94 Ren=C3=A9e<br>long =',
    'line</p>',
  ].join('\r\n');
  const parsed = await page.evaluate(text => parseEml(text), eml);
  expect(parsed.html).toContain('Café — Renée');
  expect(parsed.html).toContain('long line');
  await expectNoErrors(h);
});

test('an Outlook .mht web archive imports through the same MIME path', async ({ page }) => {
  const h = await freshPage(page);
  const mht = [
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="mht1"',
    '',
    '--mht1',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<table><tr><td><b>Katherine Johnson</b><br>Mathematician<br>katherine@example.com</td></tr></table>',
    '--mht1--',
    '',
  ].join('\r\n');
  await page.setInputFiles('#eml-file', {
    name: 'signature.mht', mimeType: 'multipart/related', buffer: Buffer.from(mht),
  });
  await expect(page.locator('#modal-import')).not.toHaveClass(/hidden/);
  await page.click('#import-apply');
  await expect.poll(() => page.evaluate(() => state.profile.name)).toContain('Katherine');
  await expectNoErrors(h);
});

test('an Outlook .msg is detected and explained, not mis-parsed', async ({ page }) => {
  const h = await freshPage(page);
  const msg = Buffer.alloc(512);
  msg[0] = 0xD0; msg[1] = 0xCF; msg[2] = 0x11; msg[3] = 0xE0;
  await page.setInputFiles('#eml-file', {
    name: 'signature.msg', mimeType: 'application/vnd.ms-outlook', buffer: msg,
  });
  await expect(page.locator('#toasts')).toContainText(/compound-file format/i);
  await expect(page.locator('#modal-import')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});
