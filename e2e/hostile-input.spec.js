/* v0.91: hostile input — malformed archives, MIME, HTML and vCards must fail
   softly and quickly. Every case returns an error string instead of throwing. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('truncated and corrupt ZIPs are refused without throwing', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const valid = await page.evaluate(async () => {
    const zip = zipStore(await backupFiles());
    let s = '';
    for (const b of zip) s += String.fromCharCode(b);
    return btoa(s);
  });
  const bytes = Buffer.from(valid, 'base64');

  await page.setInputFiles('#restore-file', {
    name: 'short.zip', mimeType: 'application/zip', buffer: bytes.subarray(0, 40),
  });
  await expect(page.locator('#toasts')).toContainText(/could not be read/i);
  await expect(page.locator('#modal-restore')).toHaveClass(/hidden/);

  /* Valid EOCD signature, nonsense central-directory offset. */
  const bogus = Buffer.alloc(22);
  bogus.writeUInt32LE(0x06054b50, 0);
  bogus.writeUInt16LE(1, 10);
  bogus.writeUInt32LE(0, 16);
  await page.setInputFiles('#restore-file', {
    name: 'bogus.zip', mimeType: 'application/zip', buffer: bogus,
  });
  await expect(page.locator('#toasts')).toContainText(/could not be read/i);
  await expectNoErrors(h);
});

test('malformed MIME never throws and stays fast', async ({ page }) => {
  const h = await freshPage(page);
  const report = await page.evaluate(() => {
    const cases = {
      openBoundary: 'Content-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/html\r\n\r\n<p>open',
      qpBomb: 'Content-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' + '='.repeat(200000),
      badBase64: 'Content-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\n!!!! not base64 !!!!',
      noHeaders: '<table><tr><td>Ada</td></tr></table>',
      deepParts: (() => {
        let body = 'Content-Type: text/html\r\n\r\n<p>deep</p>';
        for (let i = 0; i < 40; i++) {
          body = `Content-Type: multipart/mixed; boundary="b${i}"\r\n\r\n--b${i}\r\n${body}\r\n--b${i}--`;
        }
        return body;
      })(),
    };
    const errors = [];
    const timings = {};
    for (const [name, text] of Object.entries(cases)) {
      const started = performance.now();
      try { parseEml(text); } catch (e) { errors.push(`${name}: ${e.message}`); }
      timings[name] = Math.round(performance.now() - started);
    }
    return { errors, timings };
  });
  expect(report.errors).toEqual([]);
  expect(report.timings.qpBomb).toBeLessThan(5000);
  expect(report.timings.deepParts).toBeLessThan(5000);
  await expectNoErrors(h);
});

test('deeply nested HTML import completes without blowing the stack', async ({ page }) => {
  const h = await freshPage(page);
  const report = await page.evaluate(() => {
    const depth = 2000;
    const html = '<div>'.repeat(depth) + 'Ada Lovelace' + '</div>'.repeat(depth);
    const started = performance.now();
    try {
      const parsed = parseSignatureHTML(html);
      return { ms: Math.round(performance.now() - started), name: parsed.profile.name || '' };
    } catch (e) {
      return { error: e.message };
    }
  });
  expect(report.error).toBeUndefined();
  expect(report.ms).toBeLessThan(5000);
  expect(report.name).toContain('Ada');
  await expectNoErrors(h);
});

test('garbage vCards and ZIP bytes fail softly', async ({ page }) => {
  const h = await freshPage(page);
  const report = await page.evaluate(() => {
    const out = { errors: [], vcard: null, zip: '' };
    try {
      out.vcard = parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:Unterminated');
    } catch (e) {
      out.errors.push(`vcard: ${e.message}`);
    }
    try {
      unzipStore(new Uint8Array([1, 2, 3, 4]));
    } catch (e) {
      out.zip = 'rejected';
    }
    try {
      parseVCard('\u0000\u0001binary garbage\u0002');
    } catch (e) {
      out.errors.push(`vcard2: ${e.message}`);
    }
    return out;
  });
  expect(report.errors).toEqual([]);
  expect(report.zip).toBe('rejected');
  await expectNoErrors(h);
});
