/* HTML import: paste the gmail-basic fixture and apply it to the editor.

   Note on ids: the import modal's real element ids are #btn-import (open),
   #import-src (textarea), #import-parse (parse) and #import-apply (apply to
   editor) — used here. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('gmail-basic fixture imports name and email into the editor', async ({ page }) => {
  const h = await freshPage(page);

  /* Load the fixture HTML through the same fetch trick the fixtures use. */
  const fixtureHtml = await page.evaluate(async () => {
    const src = await (await fetch('/tests/import-fixtures.js')).text();
    return new Function(src + ';return FIXTURES[0].html;')();
  });

  await page.click('#btn-import');
  await expect(page.locator('#modal-import')).not.toHaveClass(/hidden/);

  await page.fill('#import-src', fixtureHtml);
  await page.click('#import-parse');
  await expect(page.locator('#import-summary')).toContainText('Jane Doe');
  await expect(page.locator('#import-summary')).toContainText('jane@example.com');

  await page.click('#import-apply');
  await expect(page.locator('#modal-import')).toHaveClass(/hidden/);

  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Jane Doe');
  await expect(page.locator('[data-field="profile.title"]')).toHaveValue('Senior Marketing Manager');
  await expect(page.locator('[data-field="contact.email"]')).toHaveValue('jane@example.com');
  /* The fixture's tel: href is "+15551234567" — digits survive the
     importer's non-digit stripping. */
  await expect(page.locator('[data-field="contact.phone"]')).toHaveValue('+15551234567');

  /* The imported name shows up in the preview. */
  await expect
    .poll(async () => (await page.locator('#preview-frame').getAttribute('srcdoc')) || '')
    .toContain('Jane Doe');

  await expectNoErrors(h);
});
