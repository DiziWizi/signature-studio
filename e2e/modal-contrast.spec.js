/* v0.74: modal semantics, focus retention, forced colours, thumbnail fit. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('the Saved panel is a labelled modal that traps Tab and closes on Escape', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => { saveSnapshot(state, 'One'); saveSnapshot(state, 'Two'); });
  await page.click('#btn-saved');

  const panel = page.locator('#saved-panel');
  await expect(panel).toHaveAttribute('role', 'dialog');
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(panel).toHaveAttribute('aria-labelledby', 'saved-title');
  await expect(page.locator('#saved-title')).toHaveText('Saved signatures');

  /* 25 forward tabs and 5 backward: never leave the panel. */
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('#saved-panel').contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.querySelector('#saved-panel').contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(panel).not.toHaveClass(/open/);
  await expect(page.locator('#btn-saved')).toBeFocused();
  await expectNoErrors(h);
});

test('deleting a snapshot keeps focus in the list', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => { saveSnapshot(state, 'A'); saveSnapshot(state, 'B'); });
  await page.click('#btn-saved');

  await page.locator('.snap-del').first().click();
  await expect.poll(() => page.evaluate(() => {
    const a = document.activeElement;
    return { inside: document.querySelector('#saved-panel').contains(a), tag: a.tagName, label: (a.textContent || '').trim() };
  })).toMatchObject({ inside: true, tag: 'BUTTON' });
  await expect(page.locator('.saved-item')).toHaveCount(1);
  await expectNoErrors(h);
});

test('the preview sheet is a non-modal region, still Escape-closable', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  const h = await freshPage(page);
  await page.click('#peek-fab');
  const sheet = page.locator('#peek-sheet');
  await expect(sheet).toHaveAttribute('role', 'region');
  await expect(sheet).not.toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('forced colours keep toasts readable', async ({ page, context }) => {
  const h = await freshPage(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'forced-colors', value: 'active' }],
  });
  await page.evaluate(() => showToast('Contrast check'));
  const style = await page.evaluate(() => {
    const t = document.querySelector('#toasts .toast');
    const cs = getComputedStyle(t);
    return { border: cs.borderTopWidth, bg: cs.backgroundColor, color: cs.color };
  });
  expect(style.border).toBe('1px');
  expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
  await expectNoErrors(h);
});

test('template thumbnails scale to their tile at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const h = await freshPage(page);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await page.waitForTimeout(600);
  const fit = await page.evaluate(() => [...document.querySelectorAll('.thumb')].map(tile => {
    const f = tile.querySelector('.tthumb');
    return { tile: Math.round(tile.clientWidth), frame: Math.round(f.getBoundingClientRect().width) };
  }));
  expect(fit.length).toBe(18);
  for (const f of fit) {
    expect(f.frame).toBeLessThanOrEqual(f.tile + 1);
    expect(f.frame).toBeGreaterThan(f.tile - 6);
  }
  await expectNoErrors(h);
});
