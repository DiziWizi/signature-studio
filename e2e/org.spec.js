/* v0.24: Enterprise template — organisational field set. All values here
   are fictional placeholders; no real data is used. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc, openSection, openSub } = require('./helper');

test('Enterprise template renders every organisational section in order', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="profile.team"]', 'Experience Platform');
  await openSection(page, 'org');
  await openSub(page, 'sub.support');
  await page.fill('[data-field="design.supportTitle"]', 'IT Support');
  await page.fill('[data-field="design.supportChatUrl"]', 'https://chat.example.com');
  await page.fill('[data-field="design.supportChatLabel"]', 'Chat with us');
  await page.fill('[data-field="design.supportButtonLabel"]', 'Try first');
  await page.fill('[data-field="design.supportTagline"]', 'The fastest way to get help');
  await page.fill('[data-field="design.supportPhoneLocal"]', '+61 2 0000 0000');
  await page.fill('[data-field="design.supportPhoneIntl"]', '+61 3 0000 0000');
  await page.fill('[data-field="design.supportAltText"]', 'Or reach us on Teams');
  await page.fill('[data-field="design.recogniseText"]', 'See someone living our values?');
  await page.fill('[data-field="design.recogniseUrl"]', 'https://recognise.example.com');
  await page.fill('[data-field="design.recogniseLabel"]', 'Recognise them now');
  await page.fill('[data-field="design.purposeText"]', 'We exist to make data work for people.');
  await page.locator('label.switch:has(input[data-field="design.showAcknowledgement"])').click();
  await page.fill('[data-field="design.landAcknowledgement"]', 'We acknowledge the Traditional Owners of the lands on which we work.');
  await page.fill('[data-field="design.footerLeftText"]', 'Left tagline');
  await page.fill('[data-field="design.footerCenterText"]', 'Centre tagline');
  await page.fill('[data-field="design.footerRightText"]', 'Right tagline');

  await page.click('.tpl-btn[data-template="enterprise"]');
  const doc = await previewSrcdoc(page);

  const order = [
    'Experience Platform',
    'IT Support',
    'Chat with us',
    'Try first',
    'The fastest way to get help',
    '+61 2 0000 0000',
    '+61 3 0000 0000',
    'Or reach us on Teams',
    'See someone living our values?',
    'https://recognise.example.com',
    'Our purpose:',
    'We exist to make data work for people.',
    'We acknowledge the Traditional Owners of the lands on which we work.',
    'Left tagline',
    'Centre tagline',
    'Right tagline',
  ];
  let last = -1;
  for (const s of order) {
    const idx = doc.indexOf(s);
    expect(idx, `"${s}" present`).toBeGreaterThan(last);
    last = idx;
  }

  await expectNoErrors(h);
});

test('Enterprise sections are omitted when their fields are empty', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('.tpl-btn[data-template="enterprise"]');
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('width="33%"'); /* no footer row */
  expect(doc).not.toContain('Our purpose:');

  await expectNoErrors(h);
});
