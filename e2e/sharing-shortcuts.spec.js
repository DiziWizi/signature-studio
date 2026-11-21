/* v0.76: share QR, shortcut sheet, labelled undo, preview hint, free-space
   action + localised sizes. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('share QR renders the image-free link', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-export');
  await page.click('#x-share-qr');
  await expect(page.locator('#modal-qr')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qr-caption')).toContainText(/Scan to open/i);
  await expect(page.locator('#qr-note')).toContainText(/compact link/i);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('#qr-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
    return dark;
  });
  expect(painted).toBeGreaterThan(500);
  await expectNoErrors(h);
});

test('the shortcut sheet opens from ? and the topbar, and lists the keys', async ({ page }) => {
  const h = await freshPage(page);
  await page.keyboard.press('?');
  const modal = page.locator('#modal-shortcuts');
  await expect(modal).not.toHaveClass(/hidden/);
  await expect(modal).toContainText('Ctrl');
  await expect(modal).toContainText(/Copy the signature/i);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveClass(/hidden/);

  await page.click('#btn-shortcuts');
  await expect(modal).not.toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('? does nothing while typing', async ({ page }) => {
  const h = await freshPage(page);
  await page.fill('[data-field="profile.name"]', 'Ada');
  await page.keyboard.press('?');
  await expect(page.locator('#modal-shortcuts')).toHaveClass(/hidden/);
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Ada?');
  await expectNoErrors(h);
});

test('undo says what it will undo, and the toast repeats it', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.logoWidth"]');
    el.value = '120';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('.sec-reset[data-reset-sec="logo"]');

  const title = await page.locator('#btn-undo').getAttribute('title');
  expect(title).toMatch(/Undo: reset/i);
  await page.click('#btn-undo');
  await expect(page.locator('#toasts')).toContainText(/reset .* undone/i);
  expect(await page.evaluate(() => state.design.logoWidth)).toBe(120);
  await expectNoErrors(h);
});

test('the preview hint shows once and stays dismissed', async ({ page }) => {
  const h = await freshPage(page);
  const hint = page.locator('#preview-hint');
  await expect(hint).toBeVisible();
  await page.click('#preview-hint-close');
  await expect(hint).toBeHidden();
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state);
  await expect(page.locator('#preview-hint')).toBeHidden();
  await expectNoErrors(h);
});

test('a storage failure offers a way out, and sizes are localised', async ({ page }) => {
  const h = await freshPage(page);
  /* Fill, drop the draft, top up — the next rewrite cannot fit. */
  await page.evaluate(() => {
    const big = 'x'.repeat(2048);
    for (let i = 0; i < 4000; i++) {
      try { localStorage.setItem('qa.f' + i, big); } catch (e) { break; }
    }
    localStorage.removeItem('sigstudio.draft.v1');
    const small = 'x'.repeat(1024);
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('qa.t' + i, small); } catch (e) { break; }
    }
  });
  await page.fill('[data-field="profile.name"]', 'NoRoom');
  await expect(page.locator('#save-state')).toHaveText(/Not saved/i, { timeout: 4000 });
  /* The error toast carries the recovery action where the problem is. */
  const action = page.locator('#toasts .toast-action');
  await expect(action).toHaveText(/Free up space/i);
  /* The toast itself animates out, so a pointer click is unstable by design;
     exercise the action's handler directly. */
  await page.evaluate(() => document.querySelector('#toasts .toast-action').click());
  await expect(page.locator('#saved-panel')).toHaveClass(/open/);

  /* German formatting uses a comma. */
  await page.keyboard.press('Escape');
  const sizes = await page.evaluate(() => {
    document.documentElement.lang = 'de';
    return { mb: fmtSize(3.2 * 1024 * 1024), kb: fmtSize(512 * 1024) };
  });
  expect(sizes.mb).toBe('3,2 MB');
  expect(sizes.kb).toBe('512 KB');
  await expectNoErrors(h);
});
