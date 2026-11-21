/* v0.64: uploads are downscaled instead of rejected; the empty state can
   start from a worked example. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

/* Build a large noisy PNG in the page and hand it to the hidden file input
   exactly like the Upload button does. */
async function uploadGenerated(page, selector, { w = 1400, h = 1400 } = {}) {
  return page.evaluate(async ({ selector, w, h }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const img = x.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 256;
      img.data[i + 1] = Math.random() * 256;
      img.data[i + 2] = Math.random() * 256;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const input = document.querySelector(selector);
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'big-photo.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return blob.size;
  }, { selector, w, h });
}

test('a large upload is downscaled, not rejected', async ({ page }) => {
  const h = await freshPage(page);
  const originalBytes = await uploadGenerated(page, '#logo-file');
  expect(originalBytes).toBeGreaterThan(512 * 1024); /* the old hard limit */

  await expect.poll(() => page.evaluate(() =>
    (document.querySelector('[data-field="design.logoUrl"]').value || '').length), { timeout: 15000 })
    .toBeGreaterThan(0);

  const stored = await page.evaluate(() => document.querySelector('[data-field="design.logoUrl"]').value);
  const storedBytes = Math.round(stored.length * 0.75);
  /* Far smaller than the source — and small enough to embed comfortably. */
  expect(storedBytes).toBeLessThan(300 * 1024);
  expect(storedBytes).toBeLessThan(originalBytes / 4);
  expect(stored).toMatch(/^data:image\/(png|jpeg);base64,/);

  /* The toast explains what happened. */
  await expect(page.locator('#toasts')).toContainText(/optimis/i);

  await expectNoErrors(h);
});

test('a genuinely unreadable file is still refused', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(async () => {
    const big = new Uint8Array(9 * 1024 * 1024);
    const input = document.querySelector('#logo-file');
    const dt = new DataTransfer();
    dt.items.add(new File([big], 'huge.bin', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#toasts')).toContainText(/too large/i);
  expect(await page.evaluate(() => document.querySelector('[data-field="design.logoUrl"]').value)).toBe('');
  await expectNoErrors(h);
});

test('the empty state offers a worked example', async ({ page }) => {
  /* First visit: no draft, no wizard, no tour. */
  await page.goto('http://127.0.0.1:8137/?t=' + Date.now(), { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('sigstudio.wizard.done', '1');
    localStorage.setItem('sigstudio.tour.done', '1');
  });
  await page.goto('http://127.0.0.1:8137/?t=' + (Date.now() + 1), { waitUntil: 'load' });

  const guide = page.locator('#empty-guide');
  await expect(guide).not.toHaveClass(/hidden/);
  const exampleBtn = page.locator('#empty-guide-example');
  await expect(exampleBtn).toBeVisible();

  await exampleBtn.click();
  await expect.poll(() => previewSrcdoc(page)).toContain('Ada Lovelace');
  expect(await page.evaluate(() => state.profile.name)).toBe('Ada Lovelace');
  await expect(guide).toHaveClass(/hidden/);
});
