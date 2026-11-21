/* v0.77: styling system — palettes, contrast meter, name font, social colour. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('contrast meter grades text, muted and link against the background', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await expect(page.locator('#contrast-meter .cm-row')).toHaveCount(3);
  await expect(page.locator('#contrast-meter')).toContainText(/AA|AAA/);

  /* A grey that fails on white must be called out, not praised. */
  await page.fill('[data-field="design.textColor"]', '#aaaaaa');
  await expect.poll(async () => page.locator('#contrast-meter .cm-row.bad').count()).toBeGreaterThan(0);
  const text = await page.locator('#contrast-meter').innerText();
  expect(text).toMatch(/2\.\d:1/);

  /* Fixing it clears the warning. */
  await page.fill('[data-field="design.textColor"]', '#222222');
  await expect.poll(async () => page.locator('#contrast-meter .cm-row.bad').count()).toBe(0);
  await expectNoErrors(h);
});

test('a colour theme sets the whole ramp, muted included', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('.theme-swatch[data-theme="forest"]');
  const palette = await page.evaluate(() => ({
    primary: state.design.primaryColor.toLowerCase(),
    text: state.design.textColor.toLowerCase(),
    muted: state.design.mutedColor.toLowerCase(),
    divider: state.design.dividerColor.toLowerCase(),
  }));
  expect(palette.primary).toBe('#2f9e44');
  expect(palette.text).toBe('#2b3a2b');
  expect(palette.muted).toBe('#5f725f');
  expect(palette.divider).toBe('#e4efe5');
  await expectNoErrors(h);
});

test('the name font can differ from the body font', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.selectOption('[data-field="design.nameFont"]', 'classic');
  await expect.poll(() => previewSrcdoc(page)).toContain('Georgia');

  const fonts = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(document.querySelector('#preview-frame').srcdoc, 'text/html');
    const name = doc.querySelector('[data-edit="name"]');
    const company = doc.querySelector('[data-edit="company"]');
    return { name: name && name.getAttribute('style'), company: company && company.getAttribute('style') };
  });
  expect(fonts.name).toContain('Georgia');
  if (fonts.company) expect(fonts.company).not.toContain('Georgia');

  /* Night renders its name through a separate local style helper. */
  await page.evaluate(() => {
    state.design.template = 'night';
    rebuildAll();
  });
  await expect.poll(() => previewSrcdoc(page)).toContain('Georgia');
  await expectNoErrors(h);
});

test('name colour still overrides the text colour', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="design.nameColor"]', '#c81e1e');
  await expect.poll(() => previewSrcdoc(page)).toContain('color:#c81e1e');
  await expectNoErrors(h);
});

test('social icons can be brand, monochrome or outline', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const brand = await page.evaluate(() => renderSignature(state));
  expect(brand).toContain('background-color:#0a66c2');

  await page.selectOption('[data-field="design.socialColorMode"]', 'mono');
  const mono = await page.evaluate(() => renderSignature(state));
  expect(mono).toContain(`background-color:${'#3a3f47'}`);
  expect(mono).not.toContain('background-color:#0a66c2');

  await page.selectOption('[data-field="design.socialColorMode"]', 'outline');
  const outline = await page.evaluate(() => renderSignature(state));
  expect(outline).toContain('background-color:transparent');
  expect(outline).toContain('border:1px solid #0a66c2');
  await expectNoErrors(h);
});
