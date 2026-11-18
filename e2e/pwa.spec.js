/* PWA: the service worker registers, claims the page, and serves the app
   offline from its precache. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helper');

test('service worker controls the page and serves the app offline', async ({ page, context }) => {
  await freshPage(page);

  /* Catch the controllerchange event on THIS document (or a controller that
     is already set — freshPage leaves the boot-time SW registration in
     flight, and sw.js calls clients.claim() on activate, so the claim lands
     on the document that registered it without any navigation). */
  await page.evaluate(() => {
    window.__controlled = new Promise(resolve => {
      if (navigator.serviceWorker.controller) return resolve(true);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(true),
        { once: true }
      );
    });
  });

  await expect
    .poll(() => page.evaluate(() => window.__controlled), { timeout: 15_000 })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.ready.then(() => true)), { timeout: 15_000 })
    .toBe(true);

  /* Navigate to the canonical URL so the offline reload hits the precache
     './' entry (cache.match is exact — query strings would miss). */
  await page.goto('http://127.0.0.1:8137/', { waitUntil: 'load' });

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.brand-name')).toHaveText('Signature Studio');
    await expect(page.locator('#preview-frame')).toBeVisible();
    /* Wizard stays dismissed (flag lives in localStorage, read offline). */
    await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);
  } finally {
    await context.setOffline(false);
  }
});
