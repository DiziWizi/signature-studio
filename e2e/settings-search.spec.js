/* v0.58: settings search + click-to-find from the live preview. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

/* v0.71: '/' replaces Ctrl+K, which the browser reserves. */
test('search filters settings across sections and clears', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('#settings-search', 'divider');

  /* Matching controls stay; unrelated ones and their sections vanish. */
  await expect(page.locator('[data-field="design.dividerStyle"]')).toBeVisible();
  await expect(page.locator('[data-field="design.dividerColor"]')).toBeVisible();
  await expect(page.locator('details[data-sec="profile"]')).toBeHidden();
  await expect(page.locator('[data-field="profile.name"]')).toBeHidden();

  /* Clearing restores everything. */
  await page.fill('#settings-search', '');
  await expect(page.locator('details[data-sec="profile"]')).toBeVisible();
  await expect(page.locator('[data-field="profile.name"]')).toBeVisible();

  await expectNoErrors(h);
});

test('search reveals controls that are hidden by feature state', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* QR off → size hidden. */
  expect(await page.locator('[data-field="design.qrSize"]').isVisible()).toBe(false);
  await page.fill('#settings-search', 'qr size');
  await expect(page.locator('[data-field="design.qrSize"]')).toBeVisible();
  await page.fill('#settings-search', '');
  await expect(page.locator('[data-field="design.qrSize"]')).toBeHidden();

  await expectNoErrors(h);
});

test('no-match state and Ctrl+K focus', async ({ page }) => {
  const h = await freshPage(page);
  await page.fill('#settings-search', 'zzzznotathing');
  await expect(page.locator('#settings-search-empty')).toBeVisible();

  await page.keyboard.press('/');
  await expect(page.locator('#settings-search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-search')).toHaveValue('');
  await expect(page.locator('#settings-search-empty')).toBeHidden();

  await expectNoErrors(h);
});

test('clicking the preview jumps to the matching control', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Collapse Identity first so the jump has to reopen it. */
  await page.locator('details[data-sec="profile"] > summary').click();
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('details[data-sec="profile"]').open)).toBe(false);

  const frame = page.frameLocator('#preview-frame');
  await frame.locator('[data-edit="name"]').click();

  await expect.poll(() => page.evaluate(() =>
    document.querySelector('details[data-sec="profile"]').open)).toBe(true);
  await expect(page.locator('[data-field="profile.name"]').locator('xpath=ancestor::label[1]'))
    .toHaveClass(/flash/);

  /* A contact line jumps to its field. */
  await frame.locator('[data-edit="contact:email"]').first().click();
  await expect(page.locator('[data-field="contact.email"]').locator('xpath=ancestor::label[1]'))
    .toHaveClass(/flash/);

  await expectNoErrors(h);
});

test('export output carries no preview annotations', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* The preview has them… */
  const previewDoc = await page.locator('#preview-frame').evaluate(el => el.srcdoc);
  expect(previewDoc).toContain('data-edit="name"');

  /* …the exported HTML does not. */
  const exported = await page.evaluate(() => renderSignature(state));
  expect(exported).not.toContain('data-edit');

  await expectNoErrors(h);
});
