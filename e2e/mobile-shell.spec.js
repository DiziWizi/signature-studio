/* v0.105: compact phone shell and remembered section state. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ hasTouch: true });

test('the phone header keeps primary actions and folds the rest into More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const before = await page.evaluate(() => ({
    header: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    more: getComputedStyle(document.querySelector('#btn-more')).display,
    guide: document.querySelector('#btn-guide').offsetParent !== null,
    exportVisible: document.querySelector('#btn-export').offsetParent !== null,
    savedVisible: document.querySelector('#btn-saved').offsetParent !== null,
    openSections: document.querySelectorAll('details[data-sec][open]').length,
    pageH: document.body.scrollHeight,
  }));
  expect(before.header).toBeLessThan(100);
  expect(before.more).not.toBe('none');
  expect(before.guide).toBe(false);
  expect(before.exportVisible).toBe(true);
  expect(before.savedVisible).toBe(true);
  expect(before.openSections).toBe(2);
  expect(before.pageH).toBeLessThan(7000);

  await page.click('#btn-more');
  await expect(page.locator('#btn-guide')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('#btn-more').getAttribute('aria-expanded'))).toBe('true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-guide')).toBeHidden();
  await expectNoErrors(h);
});

test('section open state survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await freshPage(page);
  await page.evaluate(() => { document.querySelector('details[data-sec="contact"]').open = true; });
  await page.waitForTimeout(150);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.profile);
  expect(await page.evaluate(() => document.querySelector('details[data-sec="contact"]').open)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('details[data-sec="socials"]').open)).toBe(false);
  await expectNoErrors(h);
});

test('landscape phones also collapse into More', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const h = await freshPage(page);
  const info = await page.evaluate(() => ({
    header: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
    more: getComputedStyle(document.querySelector('#btn-more')).display,
    guide: document.querySelector('#btn-guide').offsetParent !== null,
  }));
  expect(info.more).not.toBe('none');
  expect(info.guide).toBe(false);
  expect(info.header).toBeLessThan(100);
  await expectNoErrors(h);
});
