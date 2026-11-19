/* v0.38: SW update pill + idle-rendered thumbnails. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('update pill appears when a new worker takes over, reload works', async ({ page }) => {
  const h = await freshPage(page);

  await expect(page.locator('#update-pill')).toHaveClass(/hidden/);
  await page.evaluate(() => showUpdatePill());
  await expect(page.locator('#update-pill')).not.toHaveClass(/hidden/);
  await expect(page.locator('#update-pill')).toContainText('Update available');

  /* Reload now: the page reloads and boots cleanly. */
  await page.click('#update-reload');
  await page.waitForLoadState('load');
  await expect(page.locator('#btn-sample')).toBeVisible();

  await expectNoErrors(h);
});

test('template thumbnails still refresh when the user pauses typing', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Burst of typing: thumbnails may lag, but must settle on the value. */
  for (let i = 0; i < 12; i++) {
    await page.fill('[data-field="profile.name"]', `Idle Person ${i}`);
  }
  const classic = page.locator('.tthumb[data-tpl="classic"]');
  await expect.poll(async () => {
    const doc = await classic.evaluate(el => el.srcdoc || '');
    return doc;
  }, { timeout: 5000 }).toContain('Idle Person 11');

  await expectNoErrors(h);
});
