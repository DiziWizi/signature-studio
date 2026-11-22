/* v0.85: phone pass — lazy thumbnails, section jump, share-target import. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('thumbnails render lazily as they approach the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  const h = await freshPage(page);
  await page.evaluate(() => {
    const sec = document.querySelector('details[data-sec="tpl"]');
    sec.open = true;
    renderThumbs();
  });

  await expect.poll(() => page.locator('.tthumb[data-thumb-done="1"]').count()).toBeGreaterThan(0);
  const first = await page.locator('.tthumb[data-thumb-done="1"]').count();
  const total = await page.locator('.tthumb').count();
  expect(total).toBe(25);
  /* Offscreen tiles stay blank until they are scrolled near. */
  expect(first).toBeLessThan(total);

  await page.locator('.tpl-btn[data-template="custom"]').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.tthumb[data-thumb-done="1"]').count()).toBeGreaterThan(first);
  await expectNoErrors(h);
});

test('narrow screens get a jump list that opens and focuses a section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await freshPage(page);
  const jump = page.locator('#sec-jump');
  await expect(jump).toBeVisible();
  await expect(page.locator('.sec-jump')).toBeVisible();

  await page.evaluate(() => { document.querySelector('details[data-sec="contact"]').open = false; });
  await expect(page.locator('details[data-sec="contact"]')).not.toHaveAttribute('open', '');
  await jump.selectOption('contact');
  await expect(page.locator('details[data-sec="contact"]')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => {
    const rect = document.querySelector('details[data-sec="contact"]').getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  })).toBe(true);

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator('.sec-jump')).toBeHidden();
  await expectNoErrors(h);
});

test('a shared vCard opens the importer with the mode preselected', async ({ page }) => {
  const h = await freshPage(page);
  const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Grace Hopper\nEMAIL:grace@example.com\nEND:VCARD';
  await page.goto('/?text=' + encodeURIComponent(vcard));
  await expect(page.locator('#modal-import')).not.toHaveClass(/hidden/);
  await expect(page.locator('#import-src')).toHaveValue(/BEGIN:VCARD/);
  await expect(page.locator('input[name="importMode"][value="vcard"]')).toBeChecked();
  /* The query is consumed so a reload does not reopen the modal. */
  expect(await page.evaluate(() => location.search)).toBe('');
  expect(h.pageErrors).toEqual([]);
});
