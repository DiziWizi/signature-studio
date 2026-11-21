/* v0.43: grouped export menu, wizard copy, manual-copy fallback. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('export menu is grouped: everyday actions first, power tools labelled', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');

  const menu = page.locator('#export-menu');
  await expect(menu.locator('.menu-group')).toHaveCount(3);
  await expect(menu.locator('.menu-group').nth(0)).toHaveText('Mail apps & formats');
  await expect(menu.locator('.menu-group').nth(1)).toHaveText('Receiver experience');
  await expect(menu.locator('.menu-group').nth(2)).toHaveText('Power tools');

  /* Order: copy/download/install before any group header. */
  const labels = await menu.locator('button, .menu-group').allTextContents();
  const copyIdx = labels.indexOf('Copy to clipboard');
  const groupIdx = labels.indexOf('Mail apps & formats');
  expect(copyIdx).toBeGreaterThan(-1);
  expect(copyIdx).toBeLessThan(groupIdx);

  await expectNoErrors(h);
});

test('wizard photo step accepts files, not just URLs', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-guide');
  await expect(page.locator('#modal-wizard')).not.toHaveClass(/hidden/);

  /* Step 2's photo choice copy mentions a file, not only a URL. */
  await page.locator('#modal-wizard .btn-primary').first().click(); /* Next */
  await expect(page.locator('#modal-wizard')).toContainText('from your computer');
  await expect(page.locator('#modal-wizard')).not.toContainText("I'll add an image URL");

  await expectNoErrors(h);
});

test('manual copy fallback shows a pre-selected payload', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.evaluate(() => showManualCopy('<!DOCTYPE html><p>Deb</p>'));
  await expect(page.locator('#modal-manual-copy')).not.toHaveClass(/hidden/);
  await expect(page.locator('#manual-copy-text')).toHaveValue(/Deb/);

  const sel = await page.locator('#manual-copy-text').evaluate(el => ({
    start: el.selectionStart,
    end: el.selectionEnd,
  }));
  expect(sel.end).toBeGreaterThan(sel.start);

  await page.locator('#modal-manual-copy [data-close]').click();
  await expect(page.locator('#modal-manual-copy')).toHaveClass(/hidden/);

  await expectNoErrors(h);
});
