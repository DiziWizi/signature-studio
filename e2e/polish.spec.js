/* v0.21: tagline, image alt text, photo shape, name weight. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

test('company tagline renders under the company and hides with showCompany', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="profile.tagline"]', 'Data you can trust');
  await expect.poll(() => previewSrcdoc(page)).toContain('Data you can trust');

  await page.locator('label.switch:has(input[data-field="design.showCompany"])').click();
  await expect.poll(() => previewSrcdoc(page)).not.toContain('Data you can trust');

  await expectNoErrors(h);
});

test('logo and banner alt text flows into the img tags', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.fill('[data-field="design.logoUrl"]', DATA_URI);
  await page.fill('[data-field="design.logoAlt"]', 'Maya\u2019s portrait');
  await expect.poll(() => previewSrcdoc(page)).toContain('alt="Maya\u2019s portrait"');

  await page.fill('[data-field="design.bannerUrl"]', DATA_URI);
  await page.fill('[data-field="design.bannerAlt"]', 'Company logo');
  await page.click('.tpl-btn[data-template="banner"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('alt="Company logo"');

  /* Empty alt falls back to the defaults. */
  await page.fill('[data-field="design.logoAlt"]', '');
  await expect.poll(() => previewSrcdoc(page)).toContain('alt="logo"');

  await expectNoErrors(h);
});

test('photo shape: square, rounded and circle radii on the side logo', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.logoUrl"]', DATA_URI);

  await page.locator('#seg-photo-shape label:has(input[value="rounded"])').click();
  await expect.poll(() => previewSrcdoc(page)).toContain('border-radius:10px');

  await page.locator('#seg-photo-shape label:has(input[value="circle"])').click();
  await expect.poll(() => previewSrcdoc(page)).toContain('border-radius:50%');

  await page.locator('#seg-photo-shape label:has(input[value="square"])').click();
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('border-radius:10px');
  expect(doc).not.toContain('border-radius:50%');

  await expectNoErrors(h);
});

test('name weight changes the rendered name font-weight', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.selectOption('[data-field="design.nameWeight"]', 'normal');
  await expect.poll(() => previewSrcdoc(page)).toContain('font-weight:normal');

  await page.selectOption('[data-field="design.nameWeight"]', 'semibold');
  await expect.poll(() => previewSrcdoc(page)).toContain('font-weight:semibold');

  await page.selectOption('[data-field="design.nameWeight"]', 'bold');
  await expect.poll(() => previewSrcdoc(page)).toContain('font-weight:bold');

  await expectNoErrors(h);
});
