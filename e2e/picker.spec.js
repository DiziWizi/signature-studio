/* v0.98: picker search, categories and the curated start set. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

async function shown(page) {
  return page.locator('.tpl-btn:not(.hidden)').evaluateAll(btns => btns.map(b => b.dataset.template));
}

test('search narrows the grid and clears back to all 25', async ({ page }) => {
  const h = await freshPage(page);
  await expect(page.locator('#tpl-count')).toContainText('25');
  await page.fill('#tpl-search', 'book');
  await expect.poll(() => shown(page)).toEqual(['booking']);
  await expect(page.locator('#tpl-count')).toContainText('1');
  await page.fill('#tpl-search', '');
  await expect.poll(async () => (await shown(page)).length).toBe(25);
  await expectNoErrors(h);
});

test('Start here shows the curated six, categories still work', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('.tpl-cat[data-cat="start"]');
  const rec = await shown(page);
  expect(rec.sort()).toEqual(['booking', 'classic', 'minimal', 'photocard', 'reply', 'split']);

  await page.click('.tpl-cat[data-cat="public"]');
  await expect.poll(() => shown(page)).toEqual(['public']);

  /* Search and category intersect; no match shows the empty state. */
  await page.fill('#tpl-search', 'photo');
  await expect.poll(async () => (await shown(page)).length).toBe(0);
  await expect(page.locator('#tpl-empty')).not.toHaveClass(/hidden/);

  await page.fill('#tpl-search', '');
  await page.click('.tpl-cat[data-cat="all"]');
  await expect.poll(async () => (await shown(page)).length).toBe(25);
  await expect(page.locator('#tpl-empty')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});
