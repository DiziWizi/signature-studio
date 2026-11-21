/* v0.34: performance-gated thumbnail rendering + scrollable menu. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('thumbnails rebuild when the Design section reopens after edits', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Close the Design section and edit the name while it is closed. */
  const design = page.locator('details[data-sec="tpl"]');
  await design.locator('> summary').click();
  await expect(design).not.toHaveAttribute('open', '');
  await page.fill('[data-field="profile.name"]', 'Zed Zephyr');

  /* Reopening must refresh the thumbnails from the current state. */
  await design.locator('> summary').click();
  const classic = page.locator('.tthumb[data-tpl="classic"]');
  await expect.poll(async () => {
    const doc = await classic.evaluate(el => el.srcdoc || '');
    return doc;
  }).toContain('Zed Zephyr');

  await expectNoErrors(h);
});

test('export menu scrolls instead of overflowing the viewport', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  const styles = await page.locator('#export-menu').evaluate(el => {
    const s = getComputedStyle(el);
    return { maxHeight: s.maxHeight, overflowY: s.overflowY };
  });
  expect(styles.maxHeight).not.toBe('none');
  expect(styles.overflowY).toBe('auto');

  await expectNoErrors(h);
});
