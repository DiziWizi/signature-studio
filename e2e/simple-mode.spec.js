/* v0.62: Simple mode hides expert formats; plainer labels; eyes on the
   remaining toggleable fields. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('Simple mode hides expert formats and keeps the everyday actions', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#mode-simple');

  await page.click('#btn-export');
  await expect(page.locator('#x-apple-mail')).toBeHidden();
  await expect(page.locator('#x-thunderbird')).toBeHidden();
  await expect(page.locator('#x-vcard')).toBeHidden();
  await expect(page.locator('#x-vcard4')).toBeHidden();
  await expect(page.locator('#x-copy')).toBeVisible();
  await expect(page.locator('#x-instructions')).toBeVisible();

  /* Import HTML is an expert door too. */
  await page.click('#btn-export');
  await expect(page.locator('#btn-import')).toBeHidden();

  /* Advanced restores them. */
  await page.click('#mode-advanced');
  await page.click('#btn-export');
  await expect(page.locator('#x-apple-mail')).toBeVisible();
  await expect(page.locator('#x-vcard4')).toBeVisible();

  await expectNoErrors(h);
});

test('tagline and team lines have inline eyes', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Ada has no tagline in the sample — set one, then hide it. */
  await page.fill('[data-field="profile.tagline"]', 'Data you can trust');
  await expect.poll(() => previewSrcdoc(page)).toContain('Data you can trust');

  const tag = page.locator('label.field:has(input[data-field="profile.tagline"])');
  await tag.locator('.eye').click();
  await expect.poll(() => previewSrcdoc(page)).not.toContain('Data you can trust');
  await expect(tag).toHaveClass(/vis-off/);

  /* The team line only renders in the Enterprise template (and the field
     says so via template dimming). */
  const team = page.locator('label.field:has(input[data-field="profile.team"])');
  await expect(team).toHaveClass(/tpl-dim/);
  await page.click('.tpl-btn[data-template="enterprise"]');
  await page.fill('[data-field="profile.team"]', 'Experience Platform');
  await expect.poll(() => previewSrcdoc(page)).toContain('Experience Platform');
  await team.locator('.eye').click();
  await expect.poll(() => previewSrcdoc(page)).not.toContain('Experience Platform');

  /* Both appear in the Visibility section as switches. */
  await page.click('#mode-simple'); /* elements is never hidden */
  await expect(page.locator('input[data-field="design.showTeam"]')).toHaveCount(1);
  await expect(page.locator('input[data-field="design.showTagline"]')).toHaveCount(1);

  await expectNoErrors(h);
});

test('the socials eye turns the whole row off from the summary', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await expect.poll(() => previewSrcdoc(page)).toContain('linkedin.com');

  const summary = page.locator('details[data-sec="socials"] .sec-tools .eye');
  await summary.click();
  await expect.poll(() => previewSrcdoc(page)).not.toContain('linkedin.com');
  /* The section stays open — the eye lives in the tools row now. */
  expect(await page.evaluate(() =>
    document.querySelector('details[data-sec="socials"]').open)).toBe(true);

  await summary.click();
  await expect.poll(() => previewSrcdoc(page)).toContain('linkedin.com');

  await expectNoErrors(h);
});

test('plainer labels in place of editor jargon', async ({ page }) => {
  const h = await freshPage(page);
  const labels = await page.evaluate(() => ({
    density: (document.querySelector('[data-i18n="design.density"]') || {}).textContent,
    width: (document.querySelector('[data-i18n="design.width"]') || {}).textContent,
    size: (document.querySelector('[data-i18n="design.fontSize"]') || {}).textContent,
  }));
  expect(labels.density).toBe('Spacing preset');
  expect(labels.width).toBe('Width');
  expect(labels.size).toBe('Text size (px)');
  await expectNoErrors(h);
});
