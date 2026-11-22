/* v0.100: phone pass — field layout at 390 px and a slow-CPU thumbnail budget. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('mobile fields breathe: hints are not labels, inputs do not zoom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => {
    const d = document.querySelector('details[data-sec="logo"]');
    d.open = true;
    d.scrollIntoView();
  });

  const styles = await page.evaluate(() => {
    const hint = [...document.querySelectorAll('.hint')].find(el => el.textContent.includes('dark mode'));
    const input = document.querySelector('[data-field="design.logoUrl"]');
    const row = input ? input.closest('.url-row') : null;
    const dark = document.querySelector('[data-field="design.logoDarkUrl"]');
    const darkRow = dark ? dark.closest('.portrait-row') : null;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      hintTransform: hint ? getComputedStyle(hint).textTransform : '',
      hintWeight: hint ? getComputedStyle(hint).fontWeight : '',
      inputSize: input ? getComputedStyle(input).fontSize : '',
      inputWidth: input && row ? input.clientWidth / row.clientWidth : 0,
      darkWidth: dark && darkRow ? dark.clientWidth / darkRow.clientWidth : 0,
    };
  });
  expect(styles.overflow).toBeLessThanOrEqual(0);
  expect(styles.hintTransform).toBe('none');
  expect(styles.hintWeight).toBe('400');
  expect(styles.inputSize).toBe('16px');
  expect(styles.inputWidth).toBeGreaterThan(0.9);
  expect(styles.darkWidth).toBeGreaterThan(0.9);
  await expectNoErrors(h);
});

test('a 4x-slow phone still boots and renders only nearby thumbnails', async ({ page }) => {
  test.slow();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const started = Date.now();
  const h = await freshPage(page);
  const bootMs = Date.now() - started;
  expect(bootMs).toBeLessThan(20000);

  await page.click('#btn-sample');
  await page.evaluate(() => {
    const sec = document.querySelector('details[data-sec="tpl"]');
    sec.open = true;
    renderThumbs();
  });
  await page.waitForTimeout(1500);
  const first = await page.locator('.tthumb[data-thumb-done="1"]').count();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(25);

  await page.locator('.tpl-btn[data-template="custom"]').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.tthumb[data-thumb-done="1"]').count()).toBeGreaterThan(first);
  await expectNoErrors(h);
});
