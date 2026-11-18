/* Undo/redo for structural edits: template switch and social add. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('undo/redo a template switch', async ({ page }) => {
  const h = await freshPage(page);

  /* Sample data pushes the first history entry and enables #btn-undo. */
  await page.click('#btn-sample');
  await expect(page.locator('#btn-undo')).toBeEnabled();
  await expect(page.locator('#btn-redo')).toBeDisabled();

  /* Switch to Masthead (distinctive band row; Ada has a company). */
  await page.click('.tpl-btn[data-template="masthead"]');
  await expect(page.locator('.tpl-btn[data-template="masthead"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => previewSrcdoc(page)).toContain('padding:12px 16px');

  /* Undo restores Classic (the Ada sample's template). */
  await page.click('#btn-undo');
  await expect(page.locator('.tpl-btn[data-template="classic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('padding:12px 16px');
  await expect(page.locator('#btn-redo')).toBeEnabled();

  /* Redo re-applies Masthead. */
  await page.click('#btn-redo');
  await expect(page.locator('.tpl-btn[data-template="masthead"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => previewSrcdoc(page)).toContain('padding:12px 16px');
  await expectNoErrors(h);
});

test('undo/redo adding a social', async ({ page }) => {
  const h = await freshPage(page);
  await expect(page.locator('.social-row')).toHaveCount(0);

  await page.click('#add-social');
  await expect(page.locator('.social-row')).toHaveCount(1);

  await page.click('#btn-undo');
  await expect(page.locator('.social-row')).toHaveCount(0);
  await expect(page.locator('#btn-undo')).toBeDisabled();

  await page.click('#btn-redo');
  await expect(page.locator('.social-row')).toHaveCount(1);
  await expectNoErrors(h);
});
