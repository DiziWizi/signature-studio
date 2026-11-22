/* v0.88: images live in IndexedDB, drafts and snapshots store refs. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

async function bigDataUrl(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 240;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(240, 240);
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

test('a large logo is offloaded to IndexedDB and restored on reload', async ({ page }) => {
  const h = await freshPage(page);
  const big = await bigDataUrl(page);
  expect(big.length).toBeGreaterThan(32 * 1024);

  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
    flushSave();
  }, big);
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('sigstudio.draft.v1') || '';
    return raw.includes('idb:') && !raw.includes('data:image');
  })).toBe(true);

  const refLength = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('sigstudio.draft.v1'));
    return draft.design.logoUrl.length;
  });
  expect(refLength).toBeLessThan(80);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__imagesReadyDone === true);
  const restored = await page.evaluate(() => state.design.logoUrl);
  expect(restored.startsWith('data:image/png')).toBe(true);
  expect(restored.length).toBeGreaterThan(32 * 1024);
  await expectNoErrors(h);
});

test('small images stay inline — no needless database writes', async ({ page }) => {
  const h = await freshPage(page);
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(url => {
    state.design.logoUrl = url;
    flushSave();
  }, tiny);
  await page.waitForTimeout(300);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('sigstudio.draft.v1')).design.logoUrl);
  expect(draft).toBe(tiny);
  await expectNoErrors(h);
});

test('snapshots store refs and load hydrated', async ({ page }) => {
  const h = await freshPage(page);
  const big = await bigDataUrl(page);
  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
  }, big);

  await page.evaluate(() => doSaveSnapshot());
  await expect.poll(async () => page.evaluate(() => {
    const list = listSnapshots();
    return list.length === 1 && String(list[0].state.design.logoUrl).startsWith('idb:');
  })).toBe(true);

  const loaded = await page.evaluate(async () => {
    const snap = listSnapshots()[0];
    const hydrated = await loadSnapshotHydrated(snap.id);
    return hydrated.design.logoUrl.slice(0, 22);
  });
  expect(loaded).toBe('data:image/png;base64,');
  await expectNoErrors(h);
});

test('the backup carries image blobs alongside the refs', async ({ page }) => {
  const h = await freshPage(page);
  const big = await bigDataUrl(page);
  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
  }, big);
  await page.evaluate(() => doSaveSnapshot());

  const names = await page.evaluate(async () => (await backupFiles()).map(f => f.name));
  expect(names.some(n => /^images\/img-/.test(n))).toBe(true);
  expect(names).toContain('draft.json');
  await expectNoErrors(h);
});

test('garbage collection drops blobs nothing references', async ({ page }) => {
  const h = await freshPage(page);
  const big = await bigDataUrl(page);
  await page.evaluate(url => {
    state.design.logoUrl = url;
    renderPreview();
  }, big);
  await page.evaluate(() => doSaveSnapshot());

  const before = await page.evaluate(async () => (await imgKeys()).length);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(async () => {
    /* Drop the snapshot and the draft image, then collect. */
    for (const snap of listSnapshots()) deleteSnapshot(snap.id);
    state.design.logoUrl = '';
    flushSave();
    await gcImages();
  });
  const after = await page.evaluate(async () => (await imgKeys()).length);
  expect(after).toBe(0);
  await expectNoErrors(h);
});
