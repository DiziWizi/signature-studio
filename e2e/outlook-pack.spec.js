/* v0.99: classic Outlook signature-folder ZIP. */
'use strict';
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('the Outlook folder ZIP has a relative HTML and its images beside it', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.logoUrl"]', LOGO);
  await page.click('#btn-export');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-outlook-pack'),
  ]);
  const buf = fs.readFileSync(await download.path());
  const entries = await page.evaluate(b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return unzipStore(bytes).map(e => ({
      name: e.name,
      text: /\.(htm|txt)$/.test(e.name) ? new TextDecoder().decode(e.data) : '',
    }));
  }, buf.toString('base64'));

  const slug = await page.evaluate(() => slugify(state.meta.name));
  const names = entries.map(e => e.name);
  expect(names).toContain(`${slug}.htm`);
  expect(names).toContain(`${slug}_files/image-1.png`);
  expect(names).toContain('README.txt');

  const html = entries.find(e => e.name.endsWith('.htm')).text;
  expect(html).toContain(`src="${slug}_files/image-1.png"`);
  expect(html).not.toContain('data:image');
  const readme = entries.find(e => e.name === 'README.txt').text;
  expect(readme).toContain('Microsoft\\Signatures');
  expect(readme).toContain(`${slug}.htm`);
  await expectNoErrors(h);
});

test('hosted logos stay URLs in the Outlook pack', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.logoUrl"]', 'https://example.com/logo.png');
  const html = await page.evaluate(() => outlookPackFiles().find(f => f.name.endsWith('.htm')).data);
  expect(html).toContain('https://example.com/logo.png');
  expect(html).not.toContain('signature_files');
  await expectNoErrors(h);
});

test('the Outlook guide names the folder export', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-instructions');
  await page.click('.itab[data-tab="outlook"]');
  await expect(page.locator('#pane-outlook')).toContainText(/Outlook signature folder \(ZIP\)/i);
  await expect(page.locator('#pane-outlook')).toContainText(/Signatures/i);
  await expectNoErrors(h);
});
