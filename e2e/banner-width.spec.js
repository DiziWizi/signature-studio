/* v0.22: clickable banner + signature width. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

test('a banner link wraps the banner image in an anchor', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.bannerUrl"]', DATA_URI);
  await page.fill('[data-field="design.bannerLink"]', 'example.com/promo');
  await page.click('.tpl-btn[data-template="banner"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('<a href="https://example.com/promo"');
  await expect.poll(() => previewSrcdoc(page)).toContain('alt="banner"');

  /* No link → no wrapper. */
  await page.fill('[data-field="design.bannerLink"]', '');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('href="https://example.com/promo"');

  await expectNoErrors(h);
});

test('the signature width slider drives the inner table width', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await expect.poll(() => previewSrcdoc(page)).toContain('width="600"');

  /* Playwright's fill() doesn't dispatch events for range inputs. */
  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.signatureWidth"]');
    el.value = '480';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => previewSrcdoc(page)).toContain('width="480"');
  await expect.poll(() => previewSrcdoc(page)).toContain('max-width:480px');
  await expect(page.locator('#width-out')).toHaveText('480 px');

  await expectNoErrors(h);
});
