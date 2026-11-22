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

/* v0.90: history keeps image refs, not bytes, and stays within a budget. */
const PNG_BIG = async page => page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 220;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(220, 220);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.random() * 255;
    img.data[i + 1] = Math.random() * 255;
    img.data[i + 2] = Math.random() * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
});

test('history stores image refs and still restores the picture on undo', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const big = await PNG_BIG(page);
  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
    flushSave();
  }, big);
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('sigstudio.draft.v1') || '').includes('idb:'))).toBe(true);

  await page.evaluate(() => {
    pushHistory('undo.edit');
    state.profile.name = 'Changed afterwards';
    renderPreview();
  });
  const entry = await page.evaluate(() => {
    const last = undoStack[undoStack.length - 1];
    return {
      logo: last.state.design.logoUrl.slice(0, 4),
      jsonChars: JSON.stringify(last.state).length,
      size: last.size,
    };
  });
  expect(entry.logo).toBe('idb:');
  expect(entry.jsonChars).toBeLessThan(80000);
  expect(entry.size).toBeLessThan(200000);

  await page.click('#btn-undo');
  await expect.poll(() => page.evaluate(() => state.profile.name)).toBe('Ada Lovelace');
  const logo = await page.evaluate(() => state.design.logoUrl.slice(0, 10));
  expect(logo).toBe('data:image');
  await expectNoErrors(h);
});

test('the history budget trims old entries when images are uncached', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const big = await PNG_BIG(page);
  const stats = await page.evaluate(url => {
    imageIdCache.clear();
    state.design.logoUrl = url;
    for (let i = 0; i < 24; i++) pushHistory();
    return {
      n: undoStack.length,
      total: undoStack.reduce((sum, entry) => sum + (entry.size || 0), 0),
    };
  }, big);
  expect(stats.n).toBeLessThan(24);
  expect(stats.total).toBeLessThanOrEqual(6 * 1024 * 1024 + 400000);
  await expectNoErrors(h);
});

test('garbage collection keeps images referenced only by history', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const big = await PNG_BIG(page);
  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
    flushSave();
  }, big);
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('sigstudio.draft.v1') || '').includes('idb:'))).toBe(true);

  await page.evaluate(async () => {
    pushHistory();
    state.design.logoUrl = '';
    flushSave();
    await gcImages(historyImageIds());
  });
  const keys = await page.evaluate(async () => (await imgKeys()).length);
  expect(keys).toBeGreaterThan(0);
  await expectNoErrors(h);
});
