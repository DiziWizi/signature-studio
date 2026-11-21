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

test('section reset is undoable', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Change something in the Logo section, then reset the section. */
  await page.fill('[data-field="design.logoWidth"]', '120');
  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.logoWidth"]');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => state.design.logoWidth)).toBe(120);

  await page.click('.sec-reset[data-reset-sec="logo"]');
  expect(await page.evaluate(() => state.design.logoWidth)).not.toBe(120);

  await page.click('#btn-undo');
  expect(await page.evaluate(() => state.design.logoWidth)).toBe(120);
  await expectNoErrors(h);
});

test('applying edited JSON is undoable', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const before = await page.evaluate(() => state.profile.name);

  /* Open the JSON editor from the export menu and apply a new name. */
  await page.click('#btn-export');
  await page.click('#x-json');
  const edited = await page.locator('#json-text').inputValue();
  const next = edited.replace(`"name": "${before}"`, '"name": "Grace Hopper"');
  expect(next).not.toBe(edited);
  await page.fill('#json-text', next);
  await page.click('#json-apply');
  expect(await page.evaluate(() => state.profile.name)).toBe('Grace Hopper');

  await page.click('#btn-undo');
  expect(await page.evaluate(() => state.profile.name)).toBe(before);
  await expectNoErrors(h);
});
