/* v0.57: progressive settings — section order follows the signature, and
   controls hide when their feature is off (no more orphaned settings). */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors, openSub } = require('./helper');

const visible = (page, sel) => page.locator(sel).first().isVisible();

test('sections follow the signature top-to-bottom', async ({ page }) => {
  const h = await freshPage(page);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('details[data-sec]')].map(d => d.dataset.sec));
  expect(order).toEqual(['tpl', 'profile', 'logo', 'contact', 'socials', 'org', 'type', 'blocks', 'adv', 'elements']);
  await expectNoErrors(h);
});

test('every socials control lives in the Social links section', async ({ page }) => {
  const h = await freshPage(page);
  const inSocials = await page.evaluate(() => {
    const sec = document.querySelector('details[data-sec="socials"]');
    return ['design.socialStyle', 'design.socialSize', 'design.socialGap',
            'design.socialsPosition', 'design.imageRef.socials']
      .every(f => !!sec.querySelector(`[data-field="${f}"]`));
  });
  expect(inSocials).toBe(true);
  /* And they are gone from the type/colour section. */
  const inType = await page.evaluate(() => {
    const sec = document.querySelector('details[data-sec="type"]');
    return !!sec.querySelector('[data-field="design.socialsPosition"]');
  });
  expect(inType).toBe(false);
  await expectNoErrors(h);
});

test('controls hide while their feature is off, and reveal when enabled', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* QR size: hidden until the QR toggle is on. */
  expect(await visible(page, '[data-field="design.qrSize"]')).toBe(false);
  await page.locator('label.switch:has(input[data-field="design.showQr"])').click();
  await expect.poll(() => visible(page, '[data-field="design.qrSize"]')).toBe(true);

  /* Card padding: hidden until the card is on. */
  expect(await visible(page, '[data-field="design.cardPadding"]')).toBe(false);
  await page.locator('label.switch:has(input[data-field="design.showCard"])').click();
  await expect.poll(() => visible(page, '[data-field="design.cardPadding"]')).toBe(true);

  /* Divider controls follow Show divider. */
  expect(await visible(page, '[data-field="design.dividerStyle"]')).toBe(true);
  await page.locator('label.switch:has(input[data-field="design.showDivider"])').click();
  await expect.poll(() => visible(page, '[data-field="design.dividerStyle"]')).toBe(false);

  /* Contact labels vanish from the editor when labels are off. */
  expect(await visible(page, '[data-field="contact.phoneLabel"]')).toBe(true);
  await page.locator('label.switch:has(input[data-field="design.showLabels"])').click();
  await expect.poll(() => visible(page, '[data-field="contact.phoneLabel"]')).toBe(false);

  /* Hiding a contact item hides its field too. */
  await page.locator('label.switch:has(input[data-field="design.showPhone"])').click();
  await expect.poll(() => visible(page, '[data-field="contact.phone"]')).toBe(false);

  await expectNoErrors(h);
});

test('subject-dependent controls stay hidden until the subject exists', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample'); /* Ada: has socials + pronouns, no status text */

  /* Status colour waits for a badge text. */
  expect(await visible(page, '[data-field="design.statusColor"]')).toBe(false);
  await page.fill('[data-field="design.statusText"]', 'Open to work');
  await expect.poll(() => visible(page, '[data-field="design.statusColor"]')).toBe(true);

  /* Pronoun position waits for pronouns. */
  await page.fill('[data-field="profile.pronouns"]', '');
  await expect.poll(() => visible(page, '[data-field="design.pronounsPosition"][value="underName"]')).toBe(false);
  await page.fill('[data-field="profile.pronouns"]', 'she/her');
  await expect.poll(() => visible(page, '[data-field="design.pronounsPosition"][value="underName"]')).toBe(true);

  /* Image use select waits for an image to exist. */
  await page.fill('[data-field="design.logoUrl"]', '');
  await expect.poll(() => visible(page, '[data-field="design.imageRef.logo"]')).toBe(false);

  await expectNoErrors(h);
});

test('advanced controls live in the collapsed Advanced section', async ({ page }) => {
  const h = await freshPage(page);
  const adv = page.locator('details[data-sec="adv"]');
  expect(await adv.evaluate(d => d.open)).toBe(false);
  expect(await page.locator('[data-field="design.customHtml"]').isVisible()).toBe(false);
  await adv.locator('> summary').click();
  await expect(page.locator('[data-field="design.customHtml"]')).toBeVisible();
  await expectNoErrors(h);
});
