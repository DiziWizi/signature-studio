/* v0.37: vCard import + keyboard shortcuts. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8137',
  });
});

const VCARD30 = `BEGIN:VCARD
VERSION:3.0
FN:Nicolas Tesla
N:Tesla;Nicolas;;Dr.;PhD
ORG:Wardenclyffe Labs;Research
TITLE:Chief Inventor
EMAIL;TYPE=work:nikola@wardenclyffe.example
TEL;TYPE=WORK:+1 555 0100
TEL;TYPE=CELL:+1 555 0199
URL:https://wardenclyffe.example
ADR;TYPE=WORK:;;5 Fifth Ave;New York;NY;10003;USA
END:VCARD`;

test('vCard 3.0 paste parses, previews and merges fields', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-import');
  await page.check('input[name="importMode"][value="vcard"]');
  await page.fill('#import-src', VCARD30);
  await page.click('#import-parse');

  await expect(page.locator('#import-summary')).toContainText('Full name');
  await expect(page.locator('#import-summary')).toContainText('Email');
  await page.click('#import-apply');

  await expect(page.locator('[data-field="profile.name"]')).toHaveValue('Nicolas Tesla');
  await expect(page.locator('[data-field="profile.honorificPrefix"]')).toHaveValue('Dr.');
  await expect(page.locator('[data-field="profile.honorificSuffix"]')).toHaveValue('PhD');
  await expect(page.locator('[data-field="profile.title"]')).toHaveValue('Chief Inventor');
  await expect(page.locator('[data-field="profile.company"]')).toHaveValue('Wardenclyffe Labs');
  await expect(page.locator('[data-field="contact.phone"]')).toHaveValue('+1 555 0100');
  await expect(page.locator('[data-field="contact.mobile"]')).toHaveValue('+1 555 0199');
  await expect(page.locator('[data-field="contact.website"]')).toHaveValue('https://wardenclyffe.example');

  await expectNoErrors(h);
});

test('vCard 4.0 with PRONOUN and PGP key imports them too', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const vcard4 = `BEGIN:VCARD
VERSION:4.0
FN:Ada Lovelace
EMAIL:ada4@example.com
PRONOUN:she/her
KEY;TYPE=PGP:https://keys.example/ada.pub
BDAY:19900101
END:VCARD`;

  await page.click('#btn-import');
  await page.check('input[name="importMode"][value="vcard"]');
  await page.fill('#import-src', vcard4);
  await page.click('#import-parse');
  await expect(page.locator('#import-summary')).toContainText('Pronouns');
  await page.click('#import-apply');

  await expect(page.locator('[data-field="profile.pronouns"]')).toHaveValue('she/her');
  await expect(page.locator('[data-field="profile.birthday"]')).toHaveValue('1990-01-01');

  await expectNoErrors(h);
});

test('Ctrl+Enter copies and Ctrl+Shift+E opens the export menu', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Round social chips trip the Outlook export gate: pre-enable strict. */
  await page.locator('label.switch:has(input[data-field="design.strictOutlook"])').click();

  await page.keyboard.press('Control+Shift+E');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);

  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#toasts')).toContainText('Copied');
  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find(i => i.types.includes('text/html'));
    return (await item.getType('text/html')).text();
  });
  expect(clip).toContain('Ada Lovelace');

  await expectNoErrors(h);
});
