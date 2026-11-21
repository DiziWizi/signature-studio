/* v0.59: template-aware dimming, inline visibility eyes, per-section reset. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('inline eyes toggle visibility from the field and dim it', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Ada's job title is visible in the preview. */
  await expect.poll(() => previewSrcdoc(page)).toContain('Head of Analytics');

  const field = page.locator('label.field:has(input[data-field="profile.title"])');
  await field.locator('.eye').click();

  /* Out of the signature — and the field dims but stays editable. */
  await expect.poll(() => previewSrcdoc(page)).not.toContain('Head of Analytics');
  await expect(field).toHaveClass(/vis-off/);
  await expect(field.locator('input[data-field="profile.title"]')).toBeVisible();
  expect(await page.evaluate(() => state.design.showTitle)).toBe(false);

  /* The Show/hide checkbox mirrors the state. */
  expect(await page.evaluate(() =>
    document.querySelector('input[data-field="design.showTitle"]').checked)).toBe(false);

  /* Clicking again brings it back. */
  await field.locator('.eye').click();
  await expect.poll(() => previewSrcdoc(page)).toContain('Head of Analytics');
  await expect(field).not.toHaveClass(/vis-off/);

  await expectNoErrors(h);
});

test('the Show/hide checkbox keeps the eye in sync', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.locator('label.switch:has(input[data-field="design.showPhone"])').click();
  const field = page.locator('label.field:has(input[data-field="contact.phone"])');
  await expect(field).toHaveClass(/vis-off/);
  await expect(field.locator('.eye')).toHaveClass(/eye-off/);

  await expectNoErrors(h);
});

test('template-specific controls dim with a "only in" chip off their templates', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* classic */

  const banner = page.locator('[data-used-by="banner"]');
  await expect(banner).toHaveClass(/tpl-dim/);
  await expect(banner).toHaveAttribute('data-dim-label', /Banner/);

  const qr = page.locator('[data-used-by="classic,enterprise"]');
  await expect(qr).not.toHaveClass(/tpl-dim/);

  /* Switch to Banner: banner fields light up, QR dims. */
  await page.click('.tpl-btn[data-template="banner"]');
  await expect(banner).not.toHaveClass(/tpl-dim/);
  await expect(qr).toHaveClass(/tpl-dim/);
  await expect(qr).toHaveAttribute('data-dim-label', 'Only in Classic, Enterprise');

  /* Support module dims everywhere but Enterprise (the team field shares
     the enterprise-only tag, so scope to the sub-group). */
  const support = page.locator('details.sub[data-used-by="enterprise"]');
  await expect(support).toHaveClass(/tpl-dim/);
  await page.click('.tpl-btn[data-template="enterprise"]');
  await expect(support).not.toHaveClass(/tpl-dim/);

  await expectNoErrors(h);
});

test('per-section reset restores settings but never content', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Change a Divider setting and a colour, then reset the section. */
  await page.selectOption('[data-field="design.dividerStyle"]', 'dashed');
  await page.fill('[data-field="design.background"]', '#101010');
  await page.selectOption('[data-field="design.font"]', 'mono');
  await expect.poll(() => previewSrcdoc(page)).toContain('border-top:1px dashed');

  await page.locator('.sec-reset[data-reset-sec="type"]').click();

  await expect.poll(() => previewSrcdoc(page)).toContain('border-top:1px solid');
  expect(await page.evaluate(() => state.design.background)).toBe('');
  expect(await page.evaluate(() => state.design.font)).toBe('modern');
  /* Content survives the reset. */
  expect(await page.evaluate(() => state.profile.name)).toBe('Ada Lovelace');
  expect(await page.evaluate(() => state.design.legalText)).toContain('confidential');

  await expectNoErrors(h);
});

test('reset never collapses the section and resets visibility toggles', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.locator('label.switch:has(input[data-field="design.showSocials"])').click();
  expect(await page.evaluate(() => state.design.showSocials)).toBe(false);

  const elements = page.locator('details[data-sec="elements"]');
  await elements.locator('.sec-reset').click();
  expect(await page.evaluate(() => state.design.showSocials)).toBe(true);
  expect(await elements.evaluate(el => el.open)).toBe(true);

  await expectNoErrors(h);
});
