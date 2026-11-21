/* v0.80: contact layout/order, QR target, availability presets, variants. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('contact details can be inline instead of one per line', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const stacked = await page.evaluate(() => renderSignature(state));
  expect(stacked.slice(stacked.indexOf('mailto:'), stacked.indexOf('tel:'))).toContain('<br>');

  await page.selectOption('[data-field="design.contactLayout"]', 'inline');
  const inline = await page.evaluate(() => renderSignature(state));
  expect(inline.slice(inline.indexOf('mailto:'), inline.indexOf('tel:'))).not.toContain('<br>');
  await expectNoErrors(h);
});

test('contact lines can be reordered with the arrow buttons', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await expect(page.locator('#contact-order .order-row').first()).toBeVisible();

  const before = await page.evaluate(() => renderSignature(state));
  expect(before.indexOf('mailto:')).toBeLessThan(before.indexOf('tel:'));

  await page.click('.co-move[data-key="phone"][data-dir="-1"]');
  const order = await page.evaluate(() => state.design.contactOrder);
  expect(order[0]).toBe('phone');

  const after = await page.evaluate(() => renderSignature(state));
  expect(after.indexOf('tel:')).toBeLessThan(after.indexOf('mailto:'));
  /* Custom lines keep their own order behind the fixed keys. */
  expect(order).not.toContain('custom');
  await expectNoErrors(h);
});

test('the QR can encode a link instead of the vCard', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => { state.design.showQr = true; renderPreview(); });

  const vcard = await page.evaluate(() => qrPayload(state));
  expect(vcard).toContain('BEGIN:VCARD');

  await page.selectOption('[data-field="design.qrTarget"]', 'url');
  await page.fill('[data-field="design.qrUrl"]', 'cal.com/ada');
  const link = await page.evaluate(() => qrPayload(state));
  expect(link).toContain('cal.com/ada');
  expect(link).not.toContain('BEGIN:VCARD');

  /* Empty URL falls back to the vCard rather than encoding nothing. */
  await page.fill('[data-field="design.qrUrl"]', '');
  expect(await page.evaluate(() => qrPayload(state))).toContain('BEGIN:VCARD');
  await expectNoErrors(h);
});

test('availability presets set the badge text and colour', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('.status-preset[data-status="remote"]');
  await expect.poll(() => page.evaluate(() => state.design.statusText)).toBe('Working remotely');
  expect(await page.evaluate(() => state.design.statusColor)).toBe('#1c7ed6');
  await expect.poll(() => page.evaluate(() => renderSignature(state))).toContain('Working remotely');

  await page.fill('#status-date', '2027-01-12');
  await page.click('.status-preset[data-status="leave"]');
  const text = await page.evaluate(() => state.design.statusText);
  expect(text).toMatch(/^On leave until/);
  expect(text).toContain('2027');
  expect(await page.evaluate(() => state.design.statusColor)).toBe('#b45309');
  await expectNoErrors(h);
});

test('a saved signature can be starred as the default variant', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-saved');
  await page.fill('#save-name', 'External');
  await page.click('#save-now');
  await page.fill('#save-name', 'Internal');
  await page.click('#save-now');
  await expect(page.locator('#saved-list .saved-item')).toHaveCount(2);

  const internal = page.locator('.saved-item', { hasText: 'Internal' });
  await internal.locator('.snap-default').click();
  await expect(internal.locator('.snap-default')).toHaveAttribute('aria-pressed', 'true');

  await page.click('#saved-close');
  await page.click('#btn-quick');
  await expect(page.locator('#quick-menu [data-snap]').first()).toContainText('Internal');
  await expect(page.locator('#quick-menu .qs-star')).toHaveCount(1);
  await expectNoErrors(h);
});
