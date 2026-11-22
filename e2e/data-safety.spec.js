/* v0.91: persistence status, missing-image recovery, restore route. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

async function bigLogo(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 200;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255;
      img.data[i + 1] = Math.random() * 255;
      img.data[i + 2] = Math.random() * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  });
}

async function mockPersistence(page, granted) {
  await page.addInitScript(value => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(value),
        persist: () => Promise.resolve(value),
      },
    });
  }, granted);
}

test('granted persistence is stated plainly in the Saved panel', async ({ page }) => {
  await mockPersistence(page, true);
  const h = await freshPage(page);
  await page.click('#btn-saved');
  const note = page.locator('#storage-persist-note');
  await expect(note).toHaveAttribute('data-state', 'granted');
  await expect(note).toContainText(/will not clear/i);
  await expectNoErrors(h);
});

test('refused persistence warns about eviction', async ({ page }) => {
  await mockPersistence(page, false);
  const h = await freshPage(page);
  await page.click('#btn-saved');
  const note = page.locator('#storage-persist-note');
  await expect(note).toHaveAttribute('data-state', 'denied');
  await expect(note).toContainText(/may clear/i);
  await expect(note).toContainText(/backup/i);
  await expectNoErrors(h);
});

test('a missing image is reported and offers the restore route', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const big = await bigLogo(page);
  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
    flushSave();
  }, big);
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('sigstudio.draft.v1') || '').includes('idb:'))).toBe(true);

  /* Simulate eviction: remove every stored blob, then reload. */
  await page.evaluate(async () => {
    for (const id of await imgKeys()) await imgDelete(id);
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__imagesReadyDone === true);

  await expect(page.locator('#toasts')).toContainText(/could not be restored/i);
  await expect.poll(() => page.evaluate(() => state.design.logoUrl)).toBe('');

  /* The toast action opens the restore file picker rather than dead-ending. */
  await page.evaluate(() => {
    window.__restoreClicked = false;
    document.querySelector('#restore-file').addEventListener('click', () => { window.__restoreClicked = true; });
    document.querySelector('#toasts .toast-action').click();
  });
  expect(await page.evaluate(() => window.__restoreClicked)).toBe(true);
  await expectNoErrors(h);
});
