/* v0.31: Apple Mail / Thunderbird downloads + custom HTML block. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc, openSection } = require('./helper');

test('custom HTML block is embedded verbatim in every template', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await openSection(page, 'adv');
  await page.fill('[data-field="design.customHtml"]', '<!--TESTBLOCK--><p id="raw">raw line</p>');
  await expect.poll(() => previewSrcdoc(page)).toContain('<!--TESTBLOCK--><p id="raw">raw line</p>');
  await expect(page.locator('#checklist')).toContainText('no safety checks');

  /* Other templates carry it too (it lives in the shared wrapper). */
  await page.click('.tpl-btn[data-template="night"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('<!--TESTBLOCK-->');

  /* Clearing it restores the clean render. */
  await page.fill('[data-field="design.customHtml"]', '');
  await expect.poll(() => previewSrcdoc(page)).not.toContain('TESTBLOCK');

  await expectNoErrors(h);
});

test('Apple Mail download: fragment + UTF-8 meta, no document wrapper', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const dlPromise = page.waitForEvent('download');
  await page.click('#btn-export');
  await page.click('#x-apple-mail');
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('ada-lovelace-analytical-engines.mailsignature');

  const path = await dl.path();
  const content = require('fs').readFileSync(path, 'utf8');
  expect(content).toContain('meta http-equiv="Content-Type" content="text/html; charset=UTF-8"');
  expect(content).toContain('Ada Lovelace');
  expect(content).not.toContain('<!DOCTYPE');
  expect(content.trim().startsWith('<meta')).toBe(true);

  await expectNoErrors(h);
});

test('Thunderbird download: bare fragment html file', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const dlPromise = page.waitForEvent('download');
  await page.click('#btn-export');
  await page.click('#x-thunderbird');
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('ada-lovelace-analytical-engines-thunderbird.html');

  const path = await dl.path();
  const content = require('fs').readFileSync(path, 'utf8');
  expect(content.trim().startsWith('<table')).toBe(true);
  expect(content).toContain('Ada Lovelace');
  expect(content).not.toContain('<!DOCTYPE');

  await expectNoErrors(h);
});
