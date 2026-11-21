/* v0.63: narrow windows get a live preview peek instead of scrolling. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('narrow windows offer a preview peek', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const fab = page.locator('#peek-fab');
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#peek-sheet')).toHaveClass(/hidden/);

  await fab.click();
  await expect(page.locator('#peek-sheet')).not.toHaveClass(/hidden/);
  await expect(fab).toHaveAttribute('aria-expanded', 'true');

  /* The sheet mirrors the real preview. */
  const mirrored = await page.locator('#peek-frame').evaluate(el => el.srcdoc);
  expect(mirrored).toContain('Ada Lovelace');

  /* Edits keep streaming into the peek. */
  await page.fill('[data-field="profile.displayName"]', 'Ada L.');
  await expect.poll(async () =>
    page.locator('#peek-frame').evaluate(el => el.srcdoc)).toContain('Ada L.');

  /* Escape and the close button both dismiss it. */
  await page.keyboard.press('Escape');
  await expect(page.locator('#peek-sheet')).toHaveClass(/hidden/);
  await fab.click();
  await page.click('#peek-close');
  await expect(page.locator('#peek-sheet')).toHaveClass(/hidden/);

  await expectNoErrors(h);
});

test('desktop keeps the peek hidden — the real preview is right there', async ({ page }) => {
  const h = await freshPage(page);
  await expect(page.locator('#peek-fab')).toBeHidden();
  await expect(page.locator('#peek-sheet')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});
