/* v0.19: vCard NICKNAME/TZ/LANG/BDAY/UID/REV properties. */
'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

const UUID_RE = /UID:urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const REV_RE = /REV:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

async function downloadVCard(page, selector) {
  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return fs.readFileSync(await download.path(), 'utf8').replace(/\r?\n /g, '');
}

test('vCards carry nickname, timezone, languages, birthday and a stable UID', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada Lovelace */

  await page.fill('[data-field="profile.displayName"]', 'Ada L.');
  await page.fill('[data-field="profile.timezone"]', 'Australia/Melbourne');
  await page.fill('[data-field="profile.languages"]', 'English · Deutsch');
  await page.fill('[data-field="profile.birthday"]', '1815-12-10');

  const v3a = await downloadVCard(page, '#x-vcard');
  expect(v3a).toContain('NICKNAME:Ada L.');
  expect(v3a).toContain('TZ:Australia/Melbourne');
  expect(v3a).toContain('LANG:English · Deutsch');
  expect(v3a).toContain('BDAY:1815-12-10');
  const uid3a = v3a.match(UUID_RE)?.[0];
  expect(uid3a).toBeTruthy();
  expect(v3a).toMatch(REV_RE);

  /* Same state → same UID on the next download (REV may differ). */
  const v3b = await downloadVCard(page, '#x-vcard');
  expect(v3b.match(UUID_RE)?.[0]).toBe(uid3a);

  const v4 = await downloadVCard(page, '#x-vcard4');
  expect(v4).toContain('NICKNAME:Ada L.');
  expect(v4).toContain('TZ:Australia/Melbourne');
  expect(v4).toContain('LANG:English · Deutsch');
  expect(v4).toContain('BDAY:1815-12-10');
  expect(v4.match(UUID_RE)?.[0]).toBe(uid3a);
  expect(v4).toMatch(REV_RE);

  /* displayName equal to the given name's first word → no NICKNAME. */
  await page.fill('[data-field="profile.displayName"]', 'Ada');
  const v3c = await downloadVCard(page, '#x-vcard');
  expect(v3c).not.toContain('NICKNAME:');

  await expectNoErrors(h);
});
