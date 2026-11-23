/* v0.104: touch editing — arrows instead of drag, keyboard-safe fields. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ hasTouch: true });

test('touch lists use arrows, not a drag handle, and fit the phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => { document.querySelector('details[data-sec="socials"]').open = true; });

  const info = await page.evaluate(() => {
    const row = document.querySelector('.social-row');
    const drag = row ? row.querySelector('.row-drag') : null;
    const down = row ? row.querySelector('.soc-down') : null;
    return {
      drag: drag ? getComputedStyle(drag).display : 'missing',
      downH: down ? down.getBoundingClientRect().height : 0,
      wrap: row ? getComputedStyle(row).flexWrap : '',
      overflow: row ? row.scrollWidth - row.clientWidth : 99,
      scrollMargin: getComputedStyle(document.querySelector('[data-field="profile.name"]')).scrollMarginBottom,
    };
  });
  expect(info.drag).toBe('none');
  expect(info.downH).toBeGreaterThanOrEqual(36);
  expect(info.wrap).toBe('wrap');
  expect(info.overflow).toBeLessThanOrEqual(1);
  expect(info.scrollMargin).toBe('120px');

  /* The visible arrow path really reorders. */
  const before = await page.evaluate(() => state.socials.map(s => s.url));
  await page.locator('.social-row .soc-down').first().click();
  const after = await page.evaluate(() => state.socials.map(s => s.url));
  expect(after[0]).toBe(before[1]);
  expect(after[1]).toBe(before[0]);
  await expectNoErrors(h);
});

test('modals fit a landscape phone and scroll inside', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-instructions');
  const modal = await page.evaluate(() => {
    const el = document.querySelector('#modal-instructions .modal');
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      maxHeight: getComputedStyle(el).maxHeight,
      overflow: getComputedStyle(el).overflowY,
      viewport: innerHeight,
    };
  });
  expect(modal.top).toBeGreaterThanOrEqual(0);
  expect(modal.bottom).toBeLessThanOrEqual(modal.viewport + 1);
  expect(modal.height).toBeLessThanOrEqual(modal.viewport);
  await expectNoErrors(h);
});
