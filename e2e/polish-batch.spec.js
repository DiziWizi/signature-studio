/* v0.70: autosave trailing write + status, toast dedupe, target sizes,
   remote-image toggle. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('rapid edits are saved once typing stops', async ({ page }) => {
  const h = await freshPage(page);
  await page.fill('[data-field="profile.name"]', 'Hedy');
  await page.fill('[data-field="profile.title"]', 'Rapid1');
  await page.fill('[data-field="profile.title"]', 'Rapid2');

  /* A write is pending while the burst is in flight… */
  expect(await page.locator('#save-state').innerText()).toMatch(/Saving/i);

  /* …and the trailing write lands well under a second later. */
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('sigstudio.draft.v1');
    return raw ? JSON.parse(raw).profile.title : null;
  }), { timeout: 3000 }).toBe('Rapid2');
  await expect(page.locator('#save-state')).toHaveText(/Saved locally/i);
  await expectNoErrors(h);
});

test('a full storage shows an error state, not silence', async ({ page }) => {
  const h = await freshPage(page);
  /* Fill until the quota throws, drop any existing draft, then top up with
     1 KB chunks: the remaining headroom is then smaller than a 2.5 KB draft
     rewrite, so the next save genuinely fails. (Overwriting an existing
     draft only costs the delta and would quietly succeed.) */
  await page.evaluate(() => {
    const big = 'x'.repeat(2048);
    for (let i = 0; i < 4000; i++) {
      try { localStorage.setItem('qa.full.' + i, big); } catch (e) { break; }
    }
    localStorage.removeItem('sigstudio.draft.v1');
    const small = 'x'.repeat(1024);
    for (let i = 0; i < 40; i++) {
      try { localStorage.setItem('qa.top.' + i, small); } catch (e) { break; }
    }
  });
  await page.fill('[data-field="profile.name"]', 'NoRoom');
  await expect(page.locator('#save-state')).toHaveText(/Not saved/i, { timeout: 4000 });
  await expectNoErrors(h);
});

test('identical toasts collapse into one', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) showToast('Same message', '', { key: 'qa.same' });
  });
  await expect(page.locator('#toasts > .toast')).toHaveCount(1);
  await expectNoErrors(h);
});

test('pointer targets meet the 24px minimum', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const h = await freshPage(page);
  const sizes = await page.evaluate(() => {
    const r = document.querySelector('.sec-reset').getBoundingClientRect();
    const range = document.querySelector('input[type="range"]').getBoundingClientRect();
    return { reset: { w: Math.round(r.width), h: Math.round(r.height) }, rangeH: Math.round(range.height) };
  });
  expect(sizes.reset.h).toBeGreaterThanOrEqual(28);
  expect(sizes.reset.w).toBeGreaterThanOrEqual(24);
  expect(sizes.rangeH).toBeGreaterThanOrEqual(24);
  await expectNoErrors(h);
});

test('remote images can be switched off', async ({ page }) => {
  const h = await freshPage(page);
  const hits = [];
  const dot = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://logo.invalid/**', route => {
    hits.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'image/png', body: dot });
  });
  await page.evaluate(() => {
    state.design.logoUrl = 'https://logo.invalid/logo.png';
    rebuildAll();
  });
  await page.waitForTimeout(700);
  expect(hits.length).toBeGreaterThan(0);

  const before = hits.length;
  await page.uncheck('#remote-images');
  await page.waitForTimeout(700);
  expect(hits.length).toBe(before);                 /* no new requests */
  const src = await previewSrcdoc(page);
  expect(src).not.toContain('https://logo.invalid/logo.png');

  /* The stored value is untouched — exporting still carries the URL. */
  expect(await page.evaluate(() => state.design.logoUrl)).toContain('logo.invalid');
  await page.check('#remote-images');
  await page.waitForTimeout(700);
  expect(hits.length).toBeGreaterThan(before);
  await expectNoErrors(h);
});
