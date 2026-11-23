/* v0.102: phone layout — one preview, safe areas, touch-sized controls. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ hasTouch: true });

test('phones drop the duplicate in-flow preview and size controls for touch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const info = await page.evaluate(() => {
    const preview = document.querySelector('.preview-col');
    const fab = document.querySelector('#peek-fab');
    const chip = document.querySelector('.tpl-cat');
    const btn = document.querySelector('#btn-sample');
    return {
      preview: getComputedStyle(preview).display,
      fab: getComputedStyle(fab).display,
      chipH: chip.getBoundingClientRect().height,
      btnH: btn.getBoundingClientRect().height,
      pageH: document.body.scrollHeight,
      viewportFit: document.querySelector('meta[name="viewport"]').content,
      bodyH: Math.round(document.body.getBoundingClientRect().height),
    };
  });
  expect(info.preview).toBe('none');
  expect(info.fab).toBe('flex');
  expect(info.chipH).toBeGreaterThanOrEqual(40);
  expect(info.btnH).toBeGreaterThanOrEqual(40);
  expect(info.pageH).toBeLessThan(12000);
  expect(info.viewportFit).toContain('viewport-fit=cover');
  expect(info.bodyH).toBe(844);
  await expectNoErrors(h);
});

test('landscape phones also use the peek sheet, not a buried preview', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const h = await freshPage(page);
  const info = await page.evaluate(() => ({
    preview: getComputedStyle(document.querySelector('.preview-col')).display,
    fab: getComputedStyle(document.querySelector('#peek-fab')).display,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(info.preview).toBe('none');
  expect(info.fab).toBe('flex');
  expect(info.overflow).toBeLessThanOrEqual(0);
  await expectNoErrors(h);
});

test('tablets keep the preview, desktops keep two panes', async ({ page }) => {
  const h = await freshPage(page);

  await page.setViewportSize({ width: 768, height: 1024 });
  const tablet = await page.evaluate(() => ({
    preview: getComputedStyle(document.querySelector('.preview-col')).display,
    cols: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(tablet.preview).toBe('flex');
  expect(tablet.cols.split(' ').length).toBe(1);
  expect(tablet.overflow).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  const desktop = await page.evaluate(() => ({
    cols: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns,
    fab: getComputedStyle(document.querySelector('#peek-fab')).display,
  }));
  expect(desktop.cols.split(' ').length).toBe(2);
  expect(desktop.fab).toBe('none');
  await expectNoErrors(h);
});

test('320 px still has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const h = await freshPage(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await expectNoErrors(h);
});
