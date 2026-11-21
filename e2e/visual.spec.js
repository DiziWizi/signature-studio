/* v0.65: visual regression guard for the 18 layouts and the editor chrome.
   Baselines are generated and checked LOCALLY (font rasterisation differs
   between machines) — skipped on CI to keep the gate meaningful. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helper');

test.skip(!!process.env.CI, 'visual baselines are local-only (font rasterisation differs on CI)');

test('every template renders to its baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Stable pixels: no animation, no carets, no hover states. */
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await page.evaluate(() => document.querySelector('#stage').classList.remove('dark'));

  const ids = await page.$$eval('.tpl-btn', btns => btns.map(b => b.dataset.template));
  expect(ids.length).toBe(25);

  for (const id of ids) {
    await page.click(`.tpl-btn[data-template="${id}"]`);
    /* Wait for the render to settle (rAF + thumbnails). */
    await page.waitForTimeout(350);
    const shot = page.locator('.compose-sig');
    await expect(shot).toHaveScreenshot(`tpl-${id}.png`, { maxDiffPixelRatio: 0.002 });
  }

  expect(h.pageErrors).toEqual([]);
});

test('editor chrome baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await expect(page.locator('.editor')).toHaveScreenshot('editor-identity.png', { maxDiffPixelRatio: 0.002 });
  expect(h.pageErrors).toEqual([]);
});
