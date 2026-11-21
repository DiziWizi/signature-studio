/* v0.78: Templates I — Booking, Vertical card, Reply; picker categories. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('the three new layouts render their signature element', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('.tpl-btn[data-template="booking"]');
  await expect.poll(() => page.evaluate(() => state.design.template)).toBe('booking');
  /* The sample has no booking URL, so give it one: the CTA must lead. */
  await page.fill('[data-field="contact.booking"]', 'cal.com/ada');
  const booking = await page.evaluate(() => renderSignature(state));
  expect(booking).toContain('cal.com/ada');
  expect(booking).toMatch(/Book a call/);
  /* …and it sits before the legal line, not buried at the end. */
  expect(booking.indexOf('Book a call')).toBeLessThan(booking.indexOf('legal') === -1 ? booking.length : booking.indexOf('legal'));

  await page.click('.tpl-btn[data-template="vertical"]');
  const vertical = await page.evaluate(() => renderSignature(state));
  expect(vertical).toContain('align="center"');
  expect(vertical).not.toContain('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="m-cell"');

  await page.click('.tpl-btn[data-template="reply"]');
  const reply = await page.evaluate(() => renderSignature(state));
  /* One line: the name and contact share a row, and there is no divider rule. */
  const rows = (reply.match(/<tr>/g) || []).length;
  expect(rows).toBeLessThanOrEqual(3);
  expect(reply).toContain('Ada');
  await expectNoErrors(h);
});

test('reply picks up contact and role without a logo', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('.tpl-btn[data-template="reply"]');
  const html = await page.evaluate(() => renderSignature(state));
  expect(html).not.toContain('<img');
  expect(html).toMatch(/@/);
  await expectNoErrors(h);
});

test('the picker filters by category and every tile is tagged', async ({ page }) => {
  const h = await freshPage(page);
  const total = await page.locator('#tpl-picker .tpl-btn').count();
  expect(total).toBe(25);

  const untagged = await page.evaluate(() => [...document.querySelectorAll('#tpl-picker .tpl-btn')]
    .filter(b => !b.dataset.category).map(b => b.dataset.template));
  expect(untagged).toEqual([]);

  await page.click('.tpl-cat[data-cat="creative"]');
  const visible = await page.evaluate(() => [...document.querySelectorAll('#tpl-picker .tpl-btn')]
    .filter(b => !b.classList.contains('hidden')).map(b => b.dataset.template));
  expect(visible).toEqual(expect.arrayContaining(['vertical', 'roundel', 'photocard', 'night']));
  expect(visible).not.toContain('classic');
  expect(visible).not.toContain('reply');

  await page.click('.tpl-cat[data-cat="all"]');
  await expect(page.locator('#tpl-picker .tpl-btn:not(.hidden)')).toHaveCount(25);
  await expectNoErrors(h);
});

test('the four sector layouts carry their defining element', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('.tpl-btn[data-template="academic"]');
  const academic = await page.evaluate(() => renderSignature(state));
  /* Contact sits in a right-hand column beside the identity. */
  expect(academic).toMatch(/<td width="42%" align="right" valign="top">/);

  await page.fill('[data-field="contact.booking"]', 'clinic.example/book');
  await page.click('.tpl-btn[data-template="clinic"]');
  const clinic = await page.evaluate(() => renderSignature(state));
  expect(clinic).toContain('clinic.example/book');
  expect(clinic).toMatch(/Appointments/);

  await page.click('.tpl-btn[data-template="creator"]');
  const creator = await page.evaluate(() => renderSignature(state));
  const socialAt = creator.indexOf('background-color:#0a66c2');
  const mailAt = creator.indexOf('mailto:');
  expect(socialAt).toBeGreaterThan(-1);
  expect(mailAt).toBeGreaterThan(-1);
  expect(socialAt).toBeLessThan(mailAt);

  await page.click('.tpl-btn[data-template="public"]');
  await page.evaluate(() => {
    state.design.showAcknowledgement = true;
    state.design.landAcknowledgement = 'We acknowledge the Traditional Owners of the land.';
    renderPreview();
  });
  const publicHtml = await page.evaluate(() => renderSignature(state));
  expect(publicHtml).not.toContain('<img');
  expect(publicHtml).toContain('border-top:2px solid');
  expect(publicHtml).toContain('Traditional Owners');
  await expectNoErrors(h);
});

test('layout chips only claim what the template really is', async ({ page }) => {
  const h = await freshPage(page);
  const badges = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('#tpl-picker .tpl-btn')].map(b => [
      b.dataset.template,
      b.querySelector('.tpl-badge') ? b.querySelector('.tpl-badge').textContent : null,
    ])));
  expect(badges.reply).toBe('No images');
  expect(badges.monogram).toBe('No images');
  expect(badges.vertical).toBe('Photo');
  expect(badges.night).toBe('Dark');
  expect(badges.classic).toBeNull();
  await expectNoErrors(h);
});
