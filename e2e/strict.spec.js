/* Outlook strict mode: rounded corners drop from the rendered output. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

/* The .switch inputs are display:none (the .sw track is the visual), so
   page.check() can't act on them. Click the label instead — native label
   activation toggles the hidden checkbox and fires the app's change
   handler. */
async function toggleSwitch(page, field) {
  await page.locator(`label.switch:has(input[data-field="${field}"])`).click();
  await expect(page.locator(`[data-field="${field}"]`)).toBeChecked();
}

test('strict mode strips every border-radius from the signature', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await toggleSwitch(page, 'design.showCard');
  /* Photo shape: circle (the old roundPhoto switch is superseded). */
  await page.locator('#seg-photo-shape label:has(input[value="circle"])').click();
  await expect(page.locator('#seg-photo-shape input[value="circle"]')).toBeChecked();
  const doc = async () => (await page.locator('#preview-frame').getAttribute('srcdoc')) || '';

  await expect.poll(doc).toContain('border-radius');
  await expect(page.locator('#checklist')).toContainText('Strict mode');

  await toggleSwitch(page, 'design.strictOutlook');
  await expect.poll(doc).not.toContain('border-radius');
  /* The card border and background survive strict mode — Word renders both. */
  await expect.poll(doc).toContain('background-color:#f6f8fa');

  await expectNoErrors(h);
});
