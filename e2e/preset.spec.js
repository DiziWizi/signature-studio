/* Preset export → import round-trip: export the Ada preset as JSON, mutate
   the state (switch to the Maya persona), then re-import the same bytes and
   verify name, theme and socials restore exactly. */
'use strict';

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

test('preset export/import round-trips name, theme and socials', async ({ page }) => {
  const h = await freshPage(page);

  /* Export the Ada sample preset. */
  await page.click('#btn-sample');
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Ada Lovelace');
  await page.click('#btn-export');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#x-preset-export'),
  ]);
  expect(download.suggestedFilename()).toContain('preset.json');
  const bytes = fs.readFileSync(await download.path());
  const parsed = JSON.parse(bytes.toString('utf8'));
  expect(parsed.profile.name).toBe('Ada Lovelace');
  expect(parsed.socials).toHaveLength(3);
  expect(parsed.design.template).toBe('classic');

  /* Mutate the state: Maya has a different name, ocean theme, 4 socials. */
  await page.click('#btn-sample');
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Maya Chen');
  await expect(page.locator('.social-row')).toHaveCount(4);
  await expect(page.locator('[data-field="design.primaryColor"]')).toHaveValue('#0b7285');

  /* Import the exact bytes exported above. */
  await page.setInputFiles('#preset-file', {
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: bytes,
  });

  await expect
    .poll(async () => page.inputValue('[data-field="profile.name"]'))
    .toBe('Ada Lovelace');
  await expect(page.locator('[data-field="design.primaryColor"]')).toHaveValue('#2f6fed');
  await expect(page.locator('.social-row')).toHaveCount(3);
  await expect(page.locator('[data-field="contact.email"]')).toHaveValue('ada@example.com');
  await expectNoErrors(h);
});
