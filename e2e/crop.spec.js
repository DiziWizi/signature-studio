/* Image uploads: the logo path centre-crops to a square (100x100 from a
   200x100 source); the banner path keeps the original dimensions. PNG
   dimensions are decoded from the IHDR header of the resulting data: URL. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

/* Read width/height from a PNG data: URL (IHDR at bytes 16-23, big-endian). */
function pngDims(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]);
  const b = i => bin.charCodeAt(i);
  const w = ((b(16) << 24) | (b(17) << 16) | (b(18) << 8) | b(19)) >>> 0;
  const h = ((b(20) << 24) | (b(21) << 16) | (b(22) << 8) | b(23)) >>> 0;
  return { w, h };
}

test('logo upload crops to square; banner upload stays uncropped', async ({ page }) => {
  const h = await freshPage(page);

  /* Build a 200x100 PNG in-page and hand it to the hidden file inputs. */
  const b64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e0407b';
    ctx.fillRect(0, 0, 200, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const png = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };

  /* Logo: square crop. */
  await page.setInputFiles('#logo-file', png);
  await expect
    .poll(async () => page.inputValue('[data-field="design.logoUrl"]'))
    .toContain('data:image/png');
  const logoDims = await page.evaluate(pngDims, await page.inputValue('[data-field="design.logoUrl"]'));
  expect(logoDims).toEqual({ w: 100, h: 100 });

  /* Banner: no crop. */
  await page.setInputFiles('#banner-file', png);
  await expect
    .poll(async () => page.inputValue('[data-field="design.bannerUrl"]'))
    .toContain('data:image/png');
  const bannerDims = await page.evaluate(
    pngDims,
    await page.inputValue('[data-field="design.bannerUrl"]')
  );
  expect(bannerDims).toEqual({ w: 200, h: 100 });

  await expectNoErrors(h);
});
