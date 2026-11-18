/* Social links: add, fill, preview chip, reorder (▲/▼), delete, and the
   checklist info item for a social with an empty URL. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test('add, reorder and delete socials; empty URL yields a checklist info', async ({ page }) => {
  const h = await freshPage(page);

  /* Fresh state has no socials. Add one (defaults to LinkedIn). */
  await page.click('#add-social');
  await expect(page.locator('.social-row')).toHaveCount(1);

  /* An empty-URL social is flagged in the checklist and renders nothing. */
  await expect(page.locator('#checklist')).toContainText('LinkedIn has no link yet');

  await page.locator('.social-row .soc-url').fill('https://www.linkedin.com/in/testuser');
  await expect
    .poll(() => previewSrcdoc(page))
    .toContain('<a href="https://www.linkedin.com/in/testuser"');
  /* The brand-coloured glyph chip renders. */
  await expect.poll(() => previewSrcdoc(page)).toContain('background-color:#0a66c2');

  /* Second social, switched to GitHub. */
  await page.click('#add-social');
  await expect(page.locator('.social-row')).toHaveCount(2);
  await page.locator('.social-row').nth(1).locator('.soc-net').selectOption('github');
  await page.locator('.social-row').nth(1).locator('.soc-url')
    .fill('https://github.com/testuser');
  await expect
    .poll(() => previewSrcdoc(page))
    .toContain('<a href="https://github.com/testuser"');
  await expect.poll(() => previewSrcdoc(page)).toContain('background-color:#24292f');

  /* Reorder: move the second row (GitHub) up with its ▲ button. */
  await page.locator('.social-row').nth(1).locator('.soc-up').click();
  await expect(page.locator('.social-row').nth(0).locator('.soc-net')).toHaveValue('github');
  await expect(page.locator('.social-row').nth(1).locator('.soc-net')).toHaveValue('linkedin');
  /* The reorder is reflected in the preview order too. */
  let srcdoc = '';
  await expect
    .poll(async () => (srcdoc = await previewSrcdoc(page)))
    .toContain('linkedin.com/in/testuser');
  expect(srcdoc.indexOf('github.com/testuser'))
    .toBeLessThan(srcdoc.indexOf('linkedin.com/in/testuser'));

  /* And back down with its ▼ button. */
  await page.locator('.social-row').nth(0).locator('.soc-down').click();
  await expect(page.locator('.social-row').nth(0).locator('.soc-net')).toHaveValue('linkedin');
  await expect(page.locator('.social-row').nth(1).locator('.soc-net')).toHaveValue('github');

  /* Delete the LinkedIn row. */
  await page.locator('.social-row').nth(0).locator('.soc-del').click();
  await expect(page.locator('.social-row')).toHaveCount(1);
  await expect(page.locator('.social-row').nth(0).locator('.soc-net')).toHaveValue('github');
  await expect
    .poll(() => previewSrcdoc(page))
    .not.toContain('linkedin.com/in/testuser');
  await expect.poll(() => previewSrcdoc(page)).toContain('github.com/testuser');

  /* The empty-URL case again: quick-add chip path. */
  await page.click('#quick-socials .chip-btn[data-net="x"]');
  await expect(page.locator('.social-row')).toHaveCount(2);
  await expect(page.locator('#checklist')).toContainText('X / Twitter has no link yet');

  await expectNoErrors(h);
});
