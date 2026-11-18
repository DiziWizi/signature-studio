/* v0.14 customization: Show/hide elements, density presets, name size
   boost, section counts and section open-state persistence. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

async function toggle(page, field) {
  await page.locator(`label.switch:has(input[data-field="${field}"])`).click();
}

test('Show / hide toggles remove elements from the rendered signature', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada: title, company, email, phone, address, socials */

  await expect.poll(() => previewSrcdoc(page)).toContain('Head of Analytics');
  await expect.poll(() => previewSrcdoc(page)).toContain('Analytical Engines Ltd');
  await expect.poll(() => previewSrcdoc(page)).toContain('ada@example.com');

  await toggle(page, 'design.showTitle');
  await toggle(page, 'design.showCompany');
  await toggle(page, 'design.showEmail');
  await toggle(page, 'design.showPhone');
  await toggle(page, 'design.showAddress');
  await toggle(page, 'design.showSocials');

  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('Head of Analytics');
  expect(doc).not.toContain('Analytical Engines Ltd');
  expect(doc).not.toContain('ada@example.com');
  expect(doc).not.toContain('+44 20 7946 0958');
  expect(doc).not.toContain('17 Analytical Lane');
  expect(doc).not.toContain('linkedin.com/in/adalovelace');
  /* Name and mobile survive. */
  expect(doc).toContain('Ada');
  expect(doc).toContain('+44 7700 900123');

  await expectNoErrors(h);
});

test('density presets change spacing, not font sizes', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.selectOption('[data-field="design.density"]', 'compact');
  const compact = await previewSrcdoc(page);
  await page.selectOption('[data-field="design.density"]', 'airy');
  const airy = await previewSrcdoc(page);

  /* Spacer rows: <td colspan="N" height="X" style="height:Xpx;…">. */
  const maxSpacer = d => Math.max(...[...d.matchAll(/<td colspan="\d+" height="(\d+)"/g)].map(m => Number(m[1])));
  const fonts = d => [...d.matchAll(/font-size:(\d+)px/g)].map(m => Number(m[1]));
  expect(maxSpacer(airy)).toBeGreaterThan(maxSpacer(compact));
  expect(fonts(airy).sort((a, b) => a - b).join(',')).toBe(fonts(compact).sort((a, b) => a - b).join(','));

  await expectNoErrors(h);
});

test('name size boost changes the rendered name font size', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const nameSize = d => Number((d.match(/font-size:(\d+)px[^>]*>Ada Lovelace/) || [])[1]);
  const before = nameSize(await previewSrcdoc(page));
  expect(before).toBeGreaterThan(0);

  /* Playwright's fill() doesn't dispatch events for range inputs — set the
     value and dispatch the input event the app listens for explicitly. */
  await page.evaluate(() => {
    const el = document.querySelector('[data-field="design.nameSizeExtra"]');
    el.value = '8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => nameSize(await previewSrcdoc(page))).toBe(before + 5);
  await expect(page.locator('#name-size-out')).toHaveText('+8 px');

  await expectNoErrors(h);
});

test('section counts update and open state survives a reload', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada: 3 socials, 1 custom line */

  await expect(page.locator('#count-socials')).toHaveText('3');
  await expect(page.locator('#count-customs')).toHaveText('1');
  await page.click('#add-social');
  await expect(page.locator('#count-socials')).toHaveText('4');

  /* Close the Profile section and reload — it must stay closed. */
  await page.locator('details[data-sec="profile"] > summary').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('details[data-sec="profile"]').open)).toBe(false);
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => document.querySelector('details[data-sec="profile"]').open)).toBe(false);
  /* Others stay open. */
  expect(await page.evaluate(() => document.querySelector('details[data-sec="contact"]').open)).toBe(true);

  await expectNoErrors(h);
});
