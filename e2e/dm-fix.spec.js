/* v0.47: dark-mode fixes for light surfaces (support box, card). */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('support module title stays dark on its light box in dark-mode friendly', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Enterprise + support fields + dark-mode friendly. */
  await page.click('.tpl-btn[data-template="enterprise"]');
  await page.fill('[data-field="design.supportTitle"]', 'IT Support');
  await page.fill('[data-field="design.supportChatLabel"]', 'Chat with us');
  await page.fill('[data-field="design.supportChatUrl"]', 'https://chat.example.com');
  await page.fill('[data-field="design.supportTagline"]', 'The fastest way to get help');
  await page.locator('label.switch:has(input[data-field="design.darkModeFriendly"])').click();

  const doc = await previewSrcdoc(page);

  /* The title carries no dm-txt class (which would force white). */
  expect(doc).not.toContain('class="dm-txt">IT Support');
  /* Its inline colour is the dark text colour. */
  expect(doc).toContain('>IT Support</span>');
  /* The muted lines carry no dm-mut either. */
  expect(doc).not.toContain('class="dm-mut">Chat with us');
  /* The box itself stays the light tint. */
  expect(doc).toContain('background-color:#f2f4f7');

  await expectNoErrors(h);
});

test('card wrapper keeps readable text in dark-mode friendly via scoped CSS', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.locator('label.switch:has(input[data-field="design.showCard"])').click();
  await page.locator('label.switch:has(input[data-field="design.darkModeFriendly"])').click();

  const doc = await previewSrcdoc(page);
  expect(doc).toContain('data-card="1"');
  expect(doc).toContain('td[data-card="1"] .dm-txt { color:#3a3f47 !important; }');
  expect(doc).toContain('td[data-card="1"] .dm-mut');

  await expectNoErrors(h);
});

test('without dark-mode friendly the support box markup is unchanged', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('.tpl-btn[data-template="enterprise"]');
  await page.fill('[data-field="design.supportTitle"]', 'IT Support');

  const doc = await previewSrcdoc(page);
  /* No dm classes anywhere (default state). */
  expect(doc).not.toContain('dm-txt');
  expect(doc).toContain('>IT Support</span>');

  await expectNoErrors(h);
});
