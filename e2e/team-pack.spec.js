/* v0.106: team handoff — one Outlook folder per CSV row plus an index. */
'use strict';
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('the team pack has a folder per ready row and a CSV index', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.logoUrl"]', LOGO);
  await page.evaluate(() => openBulk());
  await page.fill('#bulk-csv', [
    'name,email,title',
    'Ada Lovelace,ada@example.com,Head of Analytics',
    'Grace Hopper,grace@example.com,Admiral',
    'No Email,,Skipped',
  ].join('\n'));

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#bulk-team'),
  ]);
  const buf = fs.readFileSync(await download.path());
  const entries = await page.evaluate(b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return unzipStore(bytes).map(e => ({
      name: e.name,
      text: /\.(htm|txt|csv)$/.test(e.name) ? new TextDecoder().decode(e.data) : '',
    }));
  }, buf.toString('base64'));

  const names = entries.map(e => e.name);
  expect(names.filter(n => n.endsWith('.htm')).length).toBe(2);
  expect(names).toContain('team-index.csv');
  expect(names).toContain('README.txt');
  expect(names.some(n => /_files\/image-1\.png$/.test(n))).toBe(true);

  const htm = entries.find(e => e.name.endsWith('.htm')).text;
  expect(htm).toMatch(/src="[^"]+_files\/image-1\.png"/);
  expect(htm).not.toContain('data:image');
  const index = entries.find(e => e.name === 'team-index.csv').text;
  expect(index).toContain('Ada Lovelace');
  expect(index).toContain('Grace Hopper');
  expect(index).toContain('noEmail');
  await expectNoErrors(h);
});

test('no ready rows explains instead of downloading an empty ZIP', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => openBulk());
  await page.fill('#bulk-csv', 'name,email\nNo Email,');
  await page.click('#bulk-team');
  await expect(page.locator('#toasts')).toContainText(/Nothing to generate/i);
  await expectNoErrors(h);
});
