/* v0.15: socials position control + compose-window preview chrome. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const LI = 'linkedin.com/in/adalovelace';

async function setPosition(page, pos) {
  await page.locator(`#seg-social-pos label:has(input[value="${pos}"])`).click();
}

test('socials position: bottom, under the name, and with contact details', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada, classic template */

  const idx = async () => {
    const doc = await previewSrcdoc(page);
    return { li: doc.indexOf(LI), email: doc.indexOf('ada@example.com'), legal: doc.indexOf('This message') };
  };

  let p = await idx();
  expect(p.li).toBeGreaterThan(p.email); /* default: bottom */

  await setPosition(page, 'underName');
  p = await idx();
  expect(p.li).toBeGreaterThan(-1);
  expect(p.li).toBeLessThan(p.email);

  await setPosition(page, 'inContact');
  p = await idx();
  expect(p.li).toBeGreaterThan(p.email);
  expect(p.li).toBeLessThan(p.legal);

  await setPosition(page, 'bottom');
  p = await idx();
  expect(p.li).toBeGreaterThan(p.email);

  await expectNoErrors(h);
});

test('preview sits inside a compose window whose body follows the backdrop toggle', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await expect(page.locator('#compose')).toBeVisible();
  await expect(page.locator('#compose .compose-body')).toBeVisible();
  await expect(page.locator('#compose')).toContainText('— signature below —');

  const bodyBg = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('.compose-body')).backgroundColor);

  const white = await bodyBg();
  await page.locator('#seg-bg label:has(input[value="dark"])').click();
  /* The body background transitions (.2s) — poll until it settles. */
  await expect.poll(bodyBg).not.toBe(white);
  const dark = await bodyBg();
  await page.locator('#seg-bg label:has(input[value="grey"])').click();
  await expect.poll(bodyBg).not.toBe(white);
  await expect.poll(bodyBg).not.toBe(dark);
  const grey = await bodyBg();
  expect(grey).not.toBe(white);
  expect(grey).not.toBe(dark);

  await expectNoErrors(h);
});
