/* Pre-export checklist: missing name/email on a fresh state, cleared by
   sample data, and the embedded-image warning for a data: logo. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('fresh empty state flags missing name and missing email', async ({ page }) => {
  const h = await freshPage(page);

  const checklist = page.locator('#checklist');
  await expect(checklist.locator('.check-err')).toContainText('No name set');
  await expect(checklist.locator('.check-warn')).toContainText('No email address');
  await expectNoErrors(h);
});

test('sample data clears the checklist; a data: logo brings back a warning', async ({ page }) => {
  const h = await freshPage(page);

  await expect(page.locator('#checklist')).toContainText('No name set');
  await page.click('#btn-sample');
  await expect(page.locator('#checklist')).toContainText('Ready to export');
  await expect(page.locator('#checklist .check-item')).toHaveCount(0);

  /* Embedded (data:) images are stripped by Outlook — the app must warn. */
  await page.fill('[data-field="design.logoUrl"]', 'data:image/png;base64,iVBORw0KGgo=');
  await expect(page.locator('#checklist')).toContainText('Logo is embedded');
  await expect(page.locator('#checklist .check-warn')).toBeVisible();
  await expectNoErrors(h);
});
