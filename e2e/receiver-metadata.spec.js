/* v0.81: receiver metadata — vCard photo, plain text, weight, sender, TZ. */
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function downloadText(page, openMenu, selector) {
  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

test('the vCard embeds the uploaded photo', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(png => {
    state.design.logoUrl = png;
  }, PNG_1PX);

  const { text } = await downloadText(page, true, '#x-vcard');
  const unfolded = text.replace(/\r?\n /g, '');
  expect(unfolded).toContain('BEGIN:VCARD');
  expect(unfolded).toMatch(/PHOTO;ENCODING=b;TYPE=(JPEG|PNG);?[^:]*:[A-Za-z0-9+/=]+/);
  await expectNoErrors(h);
});

test('plain-text export is readable and tag-free', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const { name, text } = await downloadText(page, true, '#x-plain');
  expect(name).toMatch(/\.txt$/);
  expect(text).toContain('Ada Lovelace');
  expect(text).toContain('ada@example.com');
  expect(text).not.toContain('<table');
  expect(text).not.toContain('<span');
  await expectNoErrors(h);
});

test('the export menu reports the HTML weight against Gmail’s clip limit', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-export');
  await expect(page.locator('#weight-note')).toContainText(/Signature HTML: \d+\.\d KB/);
  await expect(page.locator('#weight-note')).toContainText('102');

  /* A deliberately huge tagline must trip the warning state. */
  await page.evaluate(() => {
    state.profile.tagline = 'Very long tagline. '.repeat(6000);
    renderPreview();
  });
  await page.evaluate(() => updateExportNotes());
  await expect(page.locator('#weight-note')).toHaveClass(/warn/);
  await expectNoErrors(h);
});

test('sender identity shows the From line and can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-export');
  await expect(page.locator('#sender-note')).toHaveText('Ada Lovelace <ada@example.com>');

  await page.click('#x-sender-copy');
  await expect(page.locator('#toasts')).toContainText(/set them as your account display name/i);
  await expectNoErrors(h);
});

test('time zone joins the context line and the plain-text export', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="profile.timezone"]', 'AEST · UTC+11');
  await expect.poll(() => page.evaluate(() => renderSignature(state))).toContain('AEST · UTC+11');

  const { text } = await downloadText(page, true, '#x-plain');
  expect(text).toContain('AEST · UTC+11');
  await expectNoErrors(h);
});

test('contact cards build one vCard per ready CSV row and download as a ZIP', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => openBulk());
  await page.fill('#bulk-csv', 'name,email,title\nAda Lovelace,ada@example.com,Analyst\nGrace Hopper,grace@example.com,Admiral');

  const cards = await page.evaluate(() => contactCardFiles(''));
  expect(cards).toHaveLength(2);
  expect(cards[0].name).toBe('ada-lovelace-ada.vcf');
  expect(cards[0].data).toContain('BEGIN:VCARD');
  expect(cards[1].data).toContain('grace@example.com');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bulk-vcards')]);
  expect(download.suggestedFilename()).toMatch(/contact-cards\.zip$/);
  await expectNoErrors(h);
});
