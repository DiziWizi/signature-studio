/* v0.97: optional dark-mode logo pair. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const LIGHT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DARK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('a dark logo is hidden by default and swapped in dark mode', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.logoUrl"]', LIGHT);
  await page.fill('[data-field="design.logoDarkUrl"]', DARK);
  await expect.poll(() => previewSrcdoc(page)).toContain('dm-logo-dark');
  const doc = await previewSrcdoc(page);
  expect(doc).toContain('.dm-logo-light { display:none !important;');
  expect(doc).toContain('dm-logo-light');
  expect(doc).toContain('display:none;mso-hide:all;');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => {
    const f = document.querySelector('#preview-frame');
    const d = f.contentDocument;
    const light = d.querySelector('.dm-logo-light');
    const dark = d.querySelector('.dm-logo-dark');
    return light && dark
      ? [getComputedStyle(light).display, getComputedStyle(dark).display].join('|')
      : '';
  })).toBe('none|block');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => {
    const f = document.querySelector('#preview-frame');
    const d = f.contentDocument;
    const dark = d.querySelector('.dm-logo-dark');
    return dark ? getComputedStyle(dark).display : '';
  })).toBe('none');

  /* Exports keep both marks. */
  const exported = await page.evaluate(() => renderSignature(state));
  expect(exported).toContain('dm-logo-light');
  expect(exported).toContain('dm-logo-dark');
  await expectNoErrors(h);
});

test('dark logos travel with CID packages and backups keep both', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(({ light, dark }) => {
    state.design.logoUrl = light;
    state.design.logoDarkUrl = dark;
    state.design.imageRef.logo = 'cid';
    rebuildAll();
  }, { light: LIGHT, dark: DARK });
  const manifest = await page.evaluate(async () => {
    const m = await bulkAssetsAsync(state);
    return {
      cids: m.manifest.images.map(i => i.cid),
      files: m.assets.map(a => a.name),
    };
  });
  expect(manifest.cids).toContain('sigstudio-logo');
  expect(manifest.cids).toContain('sigstudio-logo-dark');
  expect(manifest.files.some(f => f.includes('logo-dark'))).toBe(true);
  await expectNoErrors(h);
});
