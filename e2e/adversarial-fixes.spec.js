/* v0.60: adversarial-pass fixes — copy never hangs, image URLs absolute,
   tour waits for the first edit, Identity-first cold start, 12px labels. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('copy always gives feedback, even when the clipboard stalls', async ({ page }) => {
  /* Simulate the WebKitGTK/unfocused-tab stall: write never settles and
     the legacy path is unavailable. */
  await page.addInitScript(() => {
    window.__clipStalled = false;
    window.__m = {};
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { write: () => { window.__clipStalled = true; return new Promise(() => {}); } },
      });
      window.__m.clipOk = true;
    } catch (e) { window.__m.clipErr = String(e); }
    try {
      Object.defineProperty(Document.prototype, 'execCommand', {
        configurable: true,
        value: () => false,
      });
      window.__m.execOk = true;
    } catch (e) { window.__m.execErr = String(e); }
  });
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Sample data has round social chips → the Outlook export gate would
     intercept Copy. Strict mode makes the export Outlook-exact, so the
     gate passes straight through (the same trick other specs use). */
  await page.locator('label.switch:has(input[data-field="design.strictOutlook"])').click();

  await page.click('#btn-export');
  await page.click('#x-copy');
  /* Prove the stall fixture actually engaged (otherwise this test would
     pass for the wrong reason on a working clipboard). */
  await expect.poll(() => page.evaluate(() => !!window.__clipStalled)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__m && window.__m.execOk)).toBe(true);

  /* Never silent: within the 1.5s timeout the fallback chain ends in the
     manual-copy modal plus an error toast. */
  await expect(page.locator('#modal-manual-copy')).not.toHaveClass(/hidden/, { timeout: 5000 });
  await expect(page.locator('#toasts')).toContainText(/clipboard|blocked/i);
  /* The payload is pre-selected for the manual paste. */
  const selected = await page.evaluate(() => {
    const ta = document.querySelector('#modal-manual-copy textarea');
    return ta ? ta.value.slice(0, 40) : null;
  });
  expect(selected).toContain('<!DOCTYPE html>');

  await expectNoErrors(h);
});

test('copy through the normal path still confirms', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.locator('label.switch:has(input[data-field="design.strictOutlook"])').click();
  await page.click('#btn-export');
  await page.click('#x-copy');
  /* Either the clipboard path or the manual fallback — but never silence. */
  await expect.poll(async () => {
    const toast = await page.locator('#toasts .toast').count();
    const manual = await page.evaluate(() =>
      getComputedStyle(document.getElementById('modal-manual-copy')).display !== 'none');
    return toast > 0 || manual;
  }, { timeout: 6000 }).toBe(true);
  await expectNoErrors(h);
});

test('scheme-less image URLs are made absolute; junk is flagged', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Exactly what Deidre pasted from IT's email. */
  await page.fill('[data-field="design.logoUrl"]', 'example.com/logo.png');
  await expect.poll(() => previewSrcdoc(page))
    .toContain('src="https://example.com/logo.png"');

  /* data: and cid: pass through untouched. */
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.fill('[data-field="design.logoUrl"]', tiny);
  await expect.poll(() => previewSrcdoc(page)).toContain('src="data:image/png;base64');

  /* A local path is not a web address — the audit says so. */
  await page.fill('[data-field="design.logoUrl"]', 'C:\\Users\\Deidre\\logo.png');
  await page.click('#btn-export');
  await page.click('#x-audit');
  await expect(page.locator('#audit-list')).toContainText('not a web address');

  /* No expectNoErrors here: the deliberately-broken image URL produces the
     exact console noise the audit is warning about. */
});

test('labels are 12px for readability', async ({ page }) => {
  const h = await freshPage(page);
  const size = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.field .lbl, .field > span')).fontSize);
  expect(size).toBe('12px');
  await expectNoErrors(h);
});
