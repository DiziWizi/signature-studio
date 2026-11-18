/* Accessibility: keyboard focus order and focus-visible rings, modal focus
   trap + restore, live regions, accessible names and reduced motion. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('Tab reaches controls from the top of the page with a visible focus-visible ring', async ({ page }) => {
  const h = await freshPage(page);

  /* Reload for a clean document: no wizard, nothing focused, so the first
     Tab starts at the top of the page. */
  await page.reload({ waitUntil: 'load' });

  /* First tab stop is the skip link. */
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() =>
    document.activeElement && document.activeElement.className)).toContain('skip-link');

  /* Next stop is the first topbar action, wearing the keyboard focus ring. */
  await page.keyboard.press('Tab');
  const state = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return {
      id: el && el.id,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      boxed: !!(el && el.getClientRects().length),
    };
  });
  expect(state.id).toBe('btn-sample');
  expect(state.outlineStyle).toBe('solid');
  expect(state.outlineWidth).toBe('2px');
  expect(state.boxed).toBe(true);

  await expectNoErrors(h);
});

test('the wizard traps Tab/Shift+Tab and Escape restores focus to the Guide button', async ({ page }) => {
  const h = await freshPage(page);

  /* Open the wizard from the keyboard so the invoker is recorded. */
  await page.locator('#btn-guide').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal-wizard')).not.toHaveClass(/hidden/);

  const inModal = () => page.evaluate(() => {
    const a = document.activeElement;
    return !!a && !!a.closest('#modal-wizard');
  });

  /* Focus moved into the dialog. */
  expect(await inModal()).toBe(true);

  /* Forward Tab must never leave the modal. */
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(await inModal(), `forward Tab ${i + 1} left the modal`).toBe(true);
  }
  /* Backward cycling stays inside too. */
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inModal(), `backward Tab ${i + 1} left the modal`).toBe(true);
  }

  /* Escape closes the dialog and focus returns to the Guide button. */
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('btn-guide');

  await expectNoErrors(h);
});

test('toasts are a polite status region and icon-only buttons have aria-labels', async ({ page }) => {
  const h = await freshPage(page);

  const toastAttrs = await page.locator('#toasts').evaluate(el => ({
    role: el.getAttribute('role'),
    live: el.getAttribute('aria-live'),
  }));
  expect(toastAttrs).toEqual({ role: 'status', live: 'polite' });

  for (const id of ['btn-quick', 'btn-undo', 'btn-redo', 'btn-reset', 'saved-close']) {
    expect(await page.locator(`#${id}`).getAttribute('aria-label'), `#${id}`).toBeTruthy();
  }

  /* Every icon-only row button (drag, image, up/down, remove) carries a name. */
  await page.click('#btn-sample');
  await page.click('#add-social');
  const names = await page.locator('.social-row .row-btn').evaluateAll(btns =>
    btns.map(b => (b.getAttribute('aria-label') || '').trim()));
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(n.length, `row button missing a name: "${n}"`).toBeGreaterThan(0);

  await expectNoErrors(h);
});

test('switches and segmented radios are keyboard-operable', async ({ page }) => {
  const h = await freshPage(page);

  /* Space toggles a switch checkbox (hidden-input pattern must stay focusable). */
  const showDivider = page.locator('[data-field="design.showDivider"]');
  const dividerBefore = await showDivider.isChecked();
  await showDivider.press('Space');
  await expect(showDivider).toBeChecked({ checked: !dividerBefore });

  /* Space selects a preview-background radio and the stage reacts. */
  const darkBg = page.locator('#seg-bg input[value="dark"]');
  const darkBefore = await darkBg.isChecked();
  await darkBg.press('Space');
  await expect(darkBg).toBeChecked({ checked: !darkBefore });
  if (!darkBefore) await expect(page.locator('#stage')).toHaveClass(/dark/);

  await expectNoErrors(h);
});

test('prefers-reduced-motion disables non-essential animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const h = await freshPage(page);

  /* Trigger a toast via the colour-theme swatches. */
  await page.click('#themes-row .theme-swatch');
  const toast = page.locator('.toast').first();
  await expect(toast).toBeVisible();
  const toastMotion = await toast.evaluate(el => {
    const cs = getComputedStyle(el);
    return { name: cs.animationName, duration: cs.animationDuration };
  });
  expect(toastMotion.name).toBe('none');

  /* Hover scale on theme swatches is neutralised. */
  const swatch = page.locator('#themes-row .theme-swatch').first();
  await swatch.hover();
  expect(await swatch.evaluate(el => getComputedStyle(el).transform)).toBe('none');

  /* Background transitions collapse to ~instant (Chromium reports .01ms in
     seconds, so compare numerically). */
  const stageDurMs = await page.locator('#stage').evaluate(el => {
    const d = getComputedStyle(el).transitionDuration;
    return d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
  });
  expect(stageDurMs).toBeLessThan(1);

  await expectNoErrors(h);
});
