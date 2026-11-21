/* v0.45: Simple / Advanced editor mode. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, openSub } = require('./helper');

const BASE = 'http://127.0.0.1:8137';

/* Unseeded boot: default mode for a new visitor is Simple. */
async function freshBoot(page) {
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'load' });
  /* Dismiss the wizard without touching mode. */
  const wiz = page.locator('#modal-wizard');
  if (!(await wiz.getAttribute('class')).includes('hidden')) {
    await page.click('#wiz-skip');
  }
}

test('new visitors start in Simple mode with expert controls hidden', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await freshBoot(page);
  await expect(page.locator('html')).toHaveClass(/mode-simple/);

  /* Expert sections hidden, fields intact. Custom lines stay: they carry
     everyday things like office hours. */
  await expect(page.locator('details[data-sec="org"]')).toBeHidden();
  await expect(page.locator('details[data-sec="blocks"]')).toBeVisible();
  await expect(page.locator('[data-field="design.customHtml"]')).toBeHidden();
  await expect(page.locator('[data-field="design.rowGap"]')).toBeHidden();

  /* Power tools vanish from the export menu. */
  await page.click('#btn-export');
  await expect(page.locator('#x-bulk')).toBeHidden();
  await expect(page.locator('#x-json')).toBeHidden();
  await expect(page.locator('#x-copy')).toBeVisible();

  expect(errs).toEqual([]);
});

test('switching to Advanced reveals controls and preserves state', async ({ page }) => {
  const h = await freshPage(page); /* seeded advanced */
  await page.click('#btn-sample');

  /* In advanced, everything is reachable. */
  await expect(page.locator('details[data-sec="org"]')).toBeVisible();

  /* Set an enterprise value, then drop to Simple: hidden but kept. */
  await openSub(page, 'sub.support');
  await page.fill('[data-field="design.supportTitle"]', 'IT Helpdesk');
  await page.click('#mode-simple');
  await expect(page.locator('html')).toHaveClass(/mode-simple/);
  await expect(page.locator('details[data-sec="org"]')).toBeHidden();

  await page.click('#mode-advanced');
  await expect(page.locator('[data-field="design.supportTitle"]')).toHaveValue('IT Helpdesk');

  await expectNoErrors(h);
});

test('Office hours quick-add drops a ready-made custom line', async ({ page }) => {
  const h = await freshPage(page); /* seeded advanced */
  await page.click('#btn-sample');

  await page.click('#add-custom-hours');
  const row = page.locator('#custom-list .custom-row').last();
  await expect(row.locator('.line-label')).toHaveValue('Office hours');
  await expect(row.locator('.line-value')).toHaveValue(/9:00/);

  /* And the preview renders the line. */
  await expect
    .poll(async () => {
      const frame = page.locator('#preview-frame');
      const doc = await frame.evaluate(el => el.srcdoc || '');
      return doc;
    })
    .toContain('Office hours');

  await expectNoErrors(h);
});

test('the mode choice persists across reloads', async ({ page }) => {
  await freshBoot(page);
  await expect(page.locator('html')).toHaveClass(/mode-simple/);

  await page.click('#mode-advanced');
  await expect(page.locator('html')).not.toHaveClass(/mode-simple/);

  await page.reload();
  await page.waitForLoadState('load');
  await expect(page.locator('html')).not.toHaveClass(/mode-simple/);
});
