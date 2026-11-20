/* v0.48: CID image reference mode + bulk manifest. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

/* A tiny valid 1x1 PNG (base64) as a stand-in for an uploaded logo. */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('CID mode rewrites every image to cid:sigstudio-<key> and restores on switch-back', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', TINY_PNG);
  await expect.poll(() => previewSrcdoc(page)).toContain('data:image/png;base64');

  await page.selectOption('[data-field="design.imageRef.logo"]', 'cid');
  await expect.poll(() => previewSrcdoc(page)).toContain('src="cid:sigstudio-logo"');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('src="data:image/png;base64');
  await expect(page.locator('#checklist')).toContainText('CID mode');

  await page.selectOption('[data-field="design.imageRef.logo"]', '');
  await expect.poll(() => previewSrcdoc(page)).toContain('src="data:image/png;base64');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('cid:sigstudio-logo');

  await expectNoErrors(h);
});

test('bulk ZIP in CID mode carries the manifest and extracted image bytes', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', TINY_PNG);
  await page.selectOption('[data-field="design.imageRef.logo"]', 'cid');

  await page.click('#btn-export');
  await page.click('#x-bulk');
  await page.fill('#bulk-csv', 'name,email\nAda Lovelace,ada@example.com\n');
  const dlPromise = page.waitForEvent('download');
  await page.click('#bulk-generate');
  const dl = await dlPromise;
  const buf = require('fs').readFileSync(await dl.path());

  const blob = buf.toString('latin1');
  expect(blob).toContain('manifest.json');
  /* The tiny transparent PNG stays PNG (JPEG would be bigger — the
     optimiser keeps whichever is smaller). */
  expect(blob).toContain('images/sigstudio-logo.png');
  expect(blob).toContain('"cid": "sigstudio-logo"');
  expect(blob).toContain('"file": "images/sigstudio-logo.png"');
  expect(blob).toContain('"optimized"');
  /* Real PNG bytes in the zip. */
  expect(blob).toContain('\x89PNG');

  await expectNoErrors(h);
});

test('oversized opaque images are downscaled and re-encoded on export', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* A 512x512 random-noise PNG (no transparency): JPEG at 72px wins hard. */
  const bigUri = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    const img = x.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.floor(Math.random() * 256);
      img.data[i + 1] = Math.floor(Math.random() * 256);
      img.data[i + 2] = Math.floor(Math.random() * 256);
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  });
  await page.fill('[data-field="design.logoUrl"]', bigUri);
  await page.selectOption('[data-field="design.imageRef.logo"]', 'cid');

  await page.click('#btn-export');
  await page.click('#x-bulk');
  await page.fill('#bulk-csv', 'name,email\nAda Lovelace,ada@example.com\n');
  const dlPromise = page.waitForEvent('download');
  await page.click('#bulk-generate');
  const dl = await dlPromise;
  const buf = require('fs').readFileSync(await dl.path());
  const blob = buf.toString('latin1');

  /* Downscaled to the 72px logo slot and re-encoded as JPEG. */
  expect(blob).toContain('images/sigstudio-logo.jpg');
  expect(blob).toContain('"mime": "image/jpeg"');
  expect(blob).toContain('"optimized": true');
  expect(blob).toContain('"width": 72');
  expect(buf.length).toBeLessThan(80000); /* nowhere near a 512px noise PNG */

  await expectNoErrors(h);
});

test('transparent images stay PNG through the optimiser', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const transUri = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 128, 128); /* fully transparent */
    x.fillStyle = 'rgba(255,0,0,1)';
    x.fillRect(32, 32, 64, 64);
    return c.toDataURL('image/png');
  });
  await page.fill('[data-field="design.logoUrl"]', transUri);
  await page.selectOption('[data-field="design.imageRef.logo"]', 'cid');

  await page.click('#btn-export');
  await page.click('#x-bulk');
  await page.fill('#bulk-csv', 'name,email\nAda Lovelace,ada@example.com\n');
  const dlPromise = page.waitForEvent('download');
  await page.click('#bulk-generate');
  const dl = await dlPromise;
  const blob = require('fs').readFileSync(await dl.path()).toString('latin1');
  expect(blob).toContain('images/sigstudio-logo.png');
  expect(blob).toContain('"mime": "image/png"');

  await expectNoErrors(h);
});

test('the audit recommends the right image strategy', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Data URI in normal mode: advisory points at hosting / CID. */
  await page.fill('[data-field="design.logoUrl"]',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  await page.click('#btn-export');
  await page.click('#x-audit');
  await expect(page.locator('#audit-list')).toContainText('Embedded (base64)');

  /* CID mode: the advisory names the manifest/pipeline. */
  await page.locator('#modal-audit [data-close]').click();
  await page.selectOption('[data-field="design.imageRef.logo"]', 'cid');
  await page.click('#btn-export');
  await page.click('#x-audit');
  await expect(page.locator('#audit-list')).toContainText('CID mode');

  await expectNoErrors(h);
});

test('hosted URLs in CID mode are listed by reference in the manifest', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', 'http://127.0.0.1:8137/assets/icons/icon-192.png');
  await page.selectOption('[data-field="design.imageRef.logo"]', 'cid');

  await expect.poll(() => previewSrcdoc(page)).toContain('src="cid:sigstudio-logo"');
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('icon-192.png');

  /* The stored URL is still in the state — the asset source of truth. */
  expect(await page.evaluate(() => state.design.logoUrl)).toContain('127.0.0.1:8137');

  await expectNoErrors(h);
});
