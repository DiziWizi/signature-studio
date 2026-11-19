/* v0.32: signature audit report. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('audit flags embedded images, radius and missing fields; downloads the report', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Make some trouble: data-URI logo, card on (radius), empty email. */
  await page.evaluate(() => {
    state.design.logoUrl = 'data:image/png;base64,iVBORw0KGgo=';
    state.design.showCard = true;
    state.contact.email = '';
    rebuildAll();
  });

  await page.click('#btn-export');
  await page.click('#x-audit');
  await expect(page.locator('#modal-audit')).not.toHaveClass(/hidden/);

  const list = page.locator('#audit-list');
  await expect(list).toContainText('embedded');
  await expect(list).toContainText('Rounded corners');
  await expect(list).toContainText('No email address');

  /* Download the report. */
  const dlPromise = page.waitForEvent('download');
  await page.click('#audit-download');
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('ada-lovelace-analytical-engines-audit.txt');
  const content = require('fs').readFileSync(await dl.path(), 'utf8');
  expect(content).toContain('Signature audit');
  expect(content).toContain('Warning');

  await expectNoErrors(h);
});

test('a clean sample signature reports no warnings', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-export');
  await page.click('#x-audit');
  await expect(page.locator('#audit-summary')).toContainText('No warnings');
  await expect(page.locator('#audit-list .audit-warn')).toHaveCount(0);

  await expectNoErrors(h);
});
