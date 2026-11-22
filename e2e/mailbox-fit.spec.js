/* v0.92: mailbox.org guidance and the paired reply signature OX expects. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('mailbox.org tab explains the paste workflow and its traps', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-instructions');
  await page.click('.itab[data-tab="mailboxorg"]');
  const pane = page.locator('#pane-mailboxorg');
  await expect(pane).toHaveClass(/active/);
  await expect(pane).toContainText(/Copy to clipboard/i);
  await expect(pane).toContainText(/per sending address/i);
  await expect(pane).toContainText(/reply slot/i);
  await expect(pane).toContainText(/New from template/);
  await expect(pane).toContainText(/placeholders do not fill/i);
  await expect(pane).toContainText(/block remote images by default/i);
  await expect(pane).toContainText(/does not display BIMI/);
  await expectNoErrors(h);
});

test('iPhone / iPad tab states the text-only limit and the correct path', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-instructions');
  await page.click('.itab[data-tab="iosmail"]');
  const pane = page.locator('#pane-iosmail');
  await expect(pane).toHaveClass(/active/);
  await expect(pane).toContainText(/Plain-text signature/i);
  await expect(pane).toContainText(/text-only/i);
  await expect(pane).toContainText(/Apps → Mail → Signature/i);
  await expect(pane).toContainText(/Per Account/i);
  await expect(pane).toContainText(/do not sync from a Mac/i);
  await expectNoErrors(h);
});

test('Save reply variant stores a paired Reply copy without changing the editor', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-saved');
  await page.fill('#save-name', 'Ada Lovelace');
  await page.click('#save-reply');

  await expect(page.locator('#toasts')).toContainText(/Reply variant saved/i);
  const saved = await page.evaluate(() => listSnapshots().map(s => ({
    name: s.name, template: s.state.design.template,
  })));
  expect(saved.length).toBe(1);
  expect(saved[0].name).toBe('Ada Lovelace — Reply');
  expect(saved[0].template).toBe('reply');

  /* The signature being edited keeps its own layout. */
  expect(await page.evaluate(() => state.design.template)).not.toBe('reply');

  /* And the copy loads back as a one-line reply signature. */
  await page.evaluate(async () => {
    const loaded = await loadSnapshotHydrated(listSnapshots()[0].id);
    state = normalizeLoadedState(loaded);
    rebuildAll();
  });
  await page.waitForFunction(() => state.design.template === 'reply');
  await expect.poll(() => page.evaluate(() => state.meta.name)).toBe('Ada Lovelace — Reply');
  await expectNoErrors(h);
});

test('packing images for storage leaves the live preview intact', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const big = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 240;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(240, 240);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255; img.data[i + 1] = 90;
      img.data[i + 2] = 160; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  });
  await page.evaluate(url => { state.design.logoUrl = url; renderPreview(); flushSave(); }, big);
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('sigstudio.draft.v1') || '').includes('idb:'))).toBe(true);

  /* Storage holds a ref; the editor keeps the picture. */
  expect(await page.evaluate(() => state.design.logoUrl.startsWith('data:image'))).toBe(true);
  const src = await page.evaluate(() => {
    const frame = document.querySelector('#preview-frame');
    const img = frame && frame.contentDocument
      ? frame.contentDocument.querySelector('img[data-edit="logo"]') : null;
    return img ? img.getAttribute('src') : '';
  });
  expect(src.startsWith('data:image')).toBe(true);
  await expectNoErrors(h);
});
