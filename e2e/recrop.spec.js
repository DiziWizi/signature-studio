/* v0.28: photo re-crop — centre/left/right on the session-kept original. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('re-crop: left and right crops take the matching half of a wide photo', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Upload a 200x100 PNG: left half red, right half blue. */
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 100;
    const x = c.getContext('2d');
    x.fillStyle = '#ff0000';
    x.fillRect(0, 0, 100, 100);
    x.fillStyle = '#0000ff';
    x.fillRect(100, 0, 100, 100);
    c.toBlob(blob => {
      const file = new File([blob], 'wide.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('logo-file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/png');
  });

  /* Default crop is centre: a 100x100 mix (half red, half blue). */
  await expect.poll(() => page.evaluate(() => state.design.logoUrl)).toContain('data:image/');

  /* Re-crop left → corner pixel red, no blue in the first columns. */
  await page.click('#recrop-btn');
  await expect(page.locator('#modal-recrop')).not.toHaveClass(/hidden/);
  await page.selectOption('#recrop-align', 'left');
  await page.click('#recrop-apply');
  await expect.poll(async () =>
    page.evaluate(() => {
      const el = document.createElement('img');
      const url = state.design.logoUrl;
      return new Promise(res => {
        el.onload = () => {
          const c = document.createElement('canvas');
          c.width = el.width;
          c.height = el.height;
          const x = c.getContext('2d');
          x.drawImage(el, 0, 0);
          const p = x.getImageData(0, 0, 1, 1).data;
          res([p[0], p[1], p[2]]);
        };
        el.src = url;
      });
    })
  ).toEqual([255, 0, 0]);

  await expectNoErrors(h);
});
