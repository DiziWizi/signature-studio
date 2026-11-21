/* v0.30: share links (?sig=), JSON editor. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8137',
  });
});

test('share link round-trips the full state', async ({ page, browser }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Make a distinctive edit, then copy the share link. */
  await page.fill('[data-field="profile.name"]', 'Xanthe');
  await page.click('#btn-export');
  await page.click('#x-share');
  await expect(page.locator('#toasts')).toContainText('Share link copied');

  const url = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find(i => i.types.includes('text/plain'));
    return (await item.getType('text/plain')).text();
  });
  expect(url).toContain('?sig=');

  /* A different person opens it: fresh storage, so no confirm step — the
     shared state loads directly, without the wizard. */
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto(url, { waitUntil: 'load' });
  await expect(page2.locator('[data-field="profile.name"]')).toHaveValue('Xanthe');
  await expect(page2.locator('#modal-wizard')).toHaveClass(/hidden/);
  await expect(page2.locator('#toasts')).toContainText('Shared signature loaded');
  await other.close();

  await expectNoErrors(h);
});

test('an invalid share link shows an error toast and keeps the draft', async ({ page }) => {
  const h = await freshPage(page);
  await page.goto('http://127.0.0.1:8137/?sig=%%%notbase64url%%%', { waitUntil: 'load' });
  await expect(page.locator('#toasts')).toContainText('invalid');
  /* The empty draft still loads normally (freshPage clears storage). */
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('');

  await expectNoErrors(h);
});

test('JSON editor applies a valid edit and rejects invalid JSON', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-export');
  await page.click('#x-json');
  await expect(page.locator('#modal-json')).not.toHaveClass(/hidden/);
  await expect(page.locator('#json-text')).toHaveValue(/"name": "Ada Lovelace"/);

  /* Invalid JSON: error toast, modal stays. */
  await page.fill('#json-text', '{ nope');
  await page.click('#json-apply');
  await expect(page.locator('#toasts')).toContainText('Invalid JSON');
  await expect(page.locator('#modal-json')).not.toHaveClass(/hidden/);

  /* Valid edit: applied to the live state. */
  const valid = await page.evaluate(() =>
    JSON.stringify({ ...state, profile: { ...state.profile, name: 'Xanthippe' } })
  );
  await page.fill('#json-text', valid);
  await page.click('#json-apply');
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Xanthippe');

  await expectNoErrors(h);
});
