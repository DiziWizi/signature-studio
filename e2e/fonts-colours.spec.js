/* v0.39: email-safe fonts, advanced colours, tagline weight, name spacing. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('email-safe font presets apply to the render', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.selectOption('[data-field="design.font"]', 'verdana');
  await expect.poll(() => previewSrcdoc(page)).toContain('font-family:Verdana, Geneva, Tahoma, sans-serif');

  await page.selectOption('[data-field="design.font"]', 'times');
  await expect.poll(() => previewSrcdoc(page)).toContain("'Times New Roman', Times, Georgia, serif");

  await expectNoErrors(h);
});

test('custom font stack overrides the preset and is sanitised', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.customFont"]', `'Segoe UI', Roboto, sans-serif; background:url("x")`);
  await expect.poll(() => previewSrcdoc(page)).toContain('Segoe UI');
  const html = await previewSrcdoc(page);
  expect(html).not.toContain('url(');
  expect(html).not.toContain('; background');

  /* Clearing falls back to the preset. */
  await page.fill('[data-field="design.customFont"]', '');
  await expect.poll(() => previewSrcdoc(page)).toContain('font-family:-apple-system');

  await expectNoErrors(h);
});

test('link, name and muted colour overrides land where they should', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.linkColor"]', '#c026d3');
  await page.fill('[data-field="design.nameColor"]', '#0d9488');
  await page.fill('[data-field="design.mutedColor"]', '#a16207');

  const html = await previewSrcdoc(page);
  expect(html).toContain('color:#c026d3');   /* company link */
  expect(html).toContain('color:#0d9488');   /* name */
  expect(html).toContain('color:#a16207');   /* muted lines */

  /* Invalid values fall back silently. */
  await page.fill('[data-field="design.linkColor"]', 'red');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('color:red');

  await expectNoErrors(h);
});

test('tagline weight and name letter-spacing apply', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.selectOption('[data-field="design.taglineWeight"]', 'bold');
  await expect.poll(() => previewSrcdoc(page)).toContain('font-weight:bold');

  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.nameSpacing"]');
    el.value = '3';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => previewSrcdoc(page)).toContain('letter-spacing:3px');
  await expect(page.locator('#name-spacing-out')).toHaveText('3 px');

  await expectNoErrors(h);
});

test('the theme picker offers the five new palettes', async ({ page }) => {
  const h = await freshPage(page);
  await expect(page.locator('#themes-row .theme-swatch')).toHaveCount(12);

  const swatch = page.locator('#themes-row .theme-swatch[data-theme="navygold"]');
  await expect(swatch).toHaveCount(1);

  /* Regression guards: no duplicate theme ids (two 'Plum' entries collided
     in v0.39) and wizard swatch labels are never ellipsis-truncated. */
  const dupes = await page.evaluate(() => {
    const ids = THEMES.map(t => t.id);
    return ids.filter((x, i) => ids.indexOf(x) !== i);
  });
  expect(dupes).toEqual([]);

  await page.reload();
  await page.waitForLoadState('load');
  /* Open the wizard (the Guide button) so the swatches actually render. */
  await page.click('#btn-guide');
  await expect(page.locator('#modal-wizard')).not.toHaveClass(/hidden/);
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('#modal-wizard .wiz-swatch-name')]
      .filter(el => el.scrollWidth > el.clientWidth + 1).length
  );
  expect(clipped).toBe(0);

  await expectNoErrors(h);
});
