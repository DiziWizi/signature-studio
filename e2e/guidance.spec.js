/* v0.61: guidance — the checklist jumps to the fix, and the instructions
   page can copy the signature itself. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('a checklist warning jumps to the control that fixes it', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Clear the email → the checklist warns. */
  await page.fill('[data-field="contact.email"]', '');
  const item = page.locator('#checklist [data-check-target="contact.email"]');
  await expect(item).toBeVisible();

  /* Collapse Contact to prove the jump reopens it. */
  await page.locator('details[data-sec="contact"] > summary').click();
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('details[data-sec="contact"]').open)).toBe(false);

  await item.click();
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('details[data-sec="contact"]').open)).toBe(true);
  await expect(page.locator('[data-field="contact.email"]').locator('xpath=ancestor::label[1]'))
    .toHaveClass(/flash/);

  await expectNoErrors(h);
});

test('checklist items are real buttons (keyboard reachable)', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="profile.name"]', '');
  await page.fill('[data-field="profile.displayName"]', '');
  const btn = page.locator('#checklist button.check-item').first();
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('type', 'button');
  await expectNoErrors(h);
});

test('the instructions page carries its own copy action', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-export');
  await page.click('#x-instructions');
  await expect(page.locator('#modal-instructions')).not.toHaveClass(/hidden/);

  const copy = page.locator('#instr-copy');
  await expect(copy).toBeVisible();
  await copy.click();

  /* Guaranteed feedback — the toast (or the manual fallback) appears. */
  await expect.poll(async () => {
    const toast = await page.locator('#toasts .toast').count();
    const manual = await page.evaluate(() =>
      getComputedStyle(document.getElementById('modal-manual-copy')).display !== 'none');
    return toast > 0 || manual;
  }, { timeout: 6000 }).toBe(true);

  await expectNoErrors(h);
});

test('every instructions tab starts with the in-page copy step', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-instructions');
  for (const tab of ['gmail', 'outlook', 'outlookmac', 'applemail', 'thunderbird', 'webmail']) {
    await page.click(`#instr-tabs [data-tab="${tab}"]`);
    const first = page.locator(`#pane-${tab} li`).first();
    await expect(first).toContainText(/Copy signature|Export/i);
  }
  await expectNoErrors(h);
});
