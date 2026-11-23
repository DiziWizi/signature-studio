/* Boot, first-run wizard and error hygiene. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, rawErrors, SANDBOX_INSTRUMENTATION_NOISE } = require('./helper');

test('app boots with zero page and console errors', async ({ page }) => {
  const h = await freshPage(page);
  await expect(page.locator('.brand-name')).toHaveText('Bowerbird');
  await expect(page.locator('#preview-frame')).toBeVisible();
  await expectNoErrors(h);
});

test('the only console noise is Playwright instrumentation blocked by the sandboxed thumbnails', async ({ page }) => {
  const h = await freshPage(page);
  /* Exercise several renders so every thumbnail refresh runs. */
  await page.click('#btn-sample');
  await page.click('.tpl-btn[data-template="banner"]');
  await page.click('.tpl-btn[data-template="classic"]');
  const raw = rawErrors(h);
  expect(raw.length).toBeGreaterThan(0);
  for (const err of raw) {
    /* Documented benign pattern only — see SANDBOX_INSTRUMENTATION_NOISE in
       helper.js. Any other console error or page error fails here. */
    expect(err).toMatch(SANDBOX_INSTRUMENTATION_NOISE);
  }
});

test('wizard auto-opens on fresh storage and #wiz-skip dismisses it permanently', async ({ page }) => {
  const h = await freshPage(page);
  expect(h.wizardShown).toBe(true);
  await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);

  /* Permanent: the done flag lives in localStorage, so a reload must not
     bring the wizard back. */
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('full wizard walkthrough (3 steps) reaches done and applies the sample data', async ({ page }) => {
  const h = await freshPage(page);

  /* freshPage already skipped the wizard — reopen it via the Guide button. */
  await page.click('#btn-guide');
  await expect(page.locator('#modal-wizard')).not.toHaveClass(/hidden/);
  await expect(page.locator('#wiz-step-1')).toBeVisible();

  /* Step 1: pick the Ocean theme. */
  await page.click('.wiz-swatch[data-theme="ocean"]');
  await page.click('[data-wiz-next="2"]');
  await expect(page.locator('#wiz-step-2')).toBeVisible();

  /* Step 2: initials monogram. */
  await page.click('.wiz-choice[data-photo="initials"]');
  await page.click('[data-wiz-next="3"]');
  await expect(page.locator('#wiz-step-3')).toBeVisible();

  /* Step 3: freelancer persona (Maya Chen), then finish. */
  await expect(page.locator('.wiz-persona-thumb iframe')).toHaveCount(5);
  await page.click('.wiz-choice[data-persona="freelancer"]');
  await page.click('#wiz-finish');

  await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);
  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Maya Chen');
  await expect(page.locator('[data-field="profile.pronouns"]')).toHaveValue('she/her');
  /* photo=initials turns the monogram on; theme=ocean sets the accent. */
  await expect(page.locator('[data-field="design.useMonogram"]')).toBeChecked();
  await expect(page.locator('[data-field="design.primaryColor"]')).toHaveValue('#0b7285');
  /* The sample data is applied to the preview. */
  await expect
    .poll(async () => (await page.locator('#preview-frame').getAttribute('srcdoc')) || '')
    .toContain('Maya');

  /* Walking the wizard again must not reopen itself on a reload. */
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});
