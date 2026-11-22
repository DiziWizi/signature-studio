/* v0.94: right-to-left content — bidi direction, mirrored alignment. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

async function setDirection(page, value) {
  await page.evaluate(v => {
    const el = document.querySelector('[data-field="design.direction"]');
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('RTL flips direction and alignment without touching the default', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const ltr = await previewSrcdoc(page);
  expect(ltr).not.toContain('dir="rtl"');
  expect(ltr).toContain('align="left"');

  await setDirection(page, 'rtl');
  await expect.poll(() => previewSrcdoc(page)).toContain('dir="rtl"');
  const rtl = await previewSrcdoc(page);
  expect(rtl).toContain('direction:rtl');
  expect(rtl).toContain('<html lang="en" dir="rtl">');
  expect(rtl).not.toContain('align="left"');
  expect(rtl).not.toContain('text-align:left');
  expect(rtl).toContain('align="right"');

  /* Exports carry the same direction. */
  const exported = await page.evaluate(() => renderSignature(state));
  expect(exported).toContain('<html lang="en" dir="rtl">');
  expect(exported).toContain('dir="rtl"');
  await expectNoErrors(h);
});

test('RTL survives save, reload and export', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="profile.name"]', 'ليلى حسن');
  await setDirection(page, 'rtl');
  await page.evaluate(() => flushSave());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.design);
  expect(await page.evaluate(() => state.design.direction)).toBe('rtl');
  await expect.poll(() => previewSrcdoc(page)).toContain('dir="rtl"');
  await expectNoErrors(h);
});

test('switching back to LTR restores the original markup', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const before = await previewSrcdoc(page);
  await setDirection(page, 'rtl');
  await expect.poll(() => previewSrcdoc(page)).toContain('dir="rtl"');
  await setDirection(page, '');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('dir="rtl"');
  const after = await previewSrcdoc(page);
  expect(after).toBe(before);
  await expectNoErrors(h);
});
