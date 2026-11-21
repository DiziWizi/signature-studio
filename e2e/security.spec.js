/* v0.67: no executable markup reaches the app, and a shared link can
   never replace open work without confirmation. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

const PAYLOAD =
  '<img src="/assets/icons/icon-192.png" onerror="parent.__pwn=(parent.__pwn||0)+1">' +
  '<script>try{parent.__stolen=(parent.__stolen||0)+1;parent.localStorage.getItem("sigstudio.draft.v1")}catch(e){}<\/script>';

test('custom HTML cannot script the app', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(payload => {
    state.design.customHtml = payload;
    rebuildAll();
  }, PAYLOAD);
  await page.waitForTimeout(700);

  expect(await page.evaluate(() => window.__pwn || 0)).toBe(0);
  expect(await page.evaluate(() => window.__stolen || 0)).toBe(0);

  /* The preview document carries no executable payload. */
  const src = await previewSrcdoc(page);
  expect(src).not.toContain('onerror="parent.__pwn');
  expect(src).not.toMatch(/<script[^>]*>try\{parent\.__stolen/);
  /* No on* handlers survived anywhere. */
  expect(src).not.toMatch(/\son[a-z]+=/i);

  await expectNoErrors(h);
});

test('a shared link cannot script the receiver', async ({ page, browser }) => {
  const h = await freshPage(page);
  const url = await page.evaluate(payload => {
    state.profile.name = 'Colleague';
    state.design.customHtml = payload;
    return location.origin + location.pathname + '?sig=' + lzwEncode(JSON.stringify(state));
  }, PAYLOAD);

  const ctx = await browser.newContext();
  const victim = await ctx.newPage();
  await victim.goto(url, { waitUntil: 'load' });
  await victim.waitForTimeout(900);
  const flags = await victim.evaluate(() => ({ pwn: window.__pwn || 0, stolen: window.__stolen || 0 }));
  expect(flags).toEqual({ pwn: 0, stolen: 0 });
  await ctx.close();
  await expectNoErrors(h);
});

test('imported JSON cannot script the app either', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-export');
  await page.click('#x-json');
  const edited = await page.evaluate(payload => {
    const doc = JSON.parse(document.querySelector('#json-text').value);
    doc.design.customHtml = payload;
    return JSON.stringify(doc);
  }, PAYLOAD);
  await page.fill('#json-text', edited);
  await page.click('#json-apply');
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__pwn || 0)).toBe(0);
  expect(await page.evaluate(() => state.design.customHtml)).not.toContain('<script');
  await expectNoErrors(h);
});

test('the preview still routes clicks back to the editor', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Wait for the annotated render (one rAF after the click). */
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('#preview-frame').contentDocument.querySelectorAll('[data-edit]').length
  )).toBeGreaterThan(0);

  await page.evaluate(() => {
    document.querySelector('#preview-frame').contentDocument.querySelector('[data-edit="name"]').click();
  });
  /* revealControl scrolls to and flashes the owning field. */
  await expect.poll(() => page.evaluate(() => {
    const input = document.querySelector('[data-field="profile.name"]');
    const box = input && input.closest('.field, label.switch, label');
    return !!(box && box.classList.contains('flash'));
  })).toBe(true);
  await expectNoErrors(h);
});

test('opening a shared link with work open asks first and stays undoable', async ({ page, browser }) => {
  const h = await freshPage(page);
  const url = await page.evaluate(() => {
    state.profile.name = 'Colleague Name';
    return location.origin + location.pathname + '?sig=' + lzwEncode(JSON.stringify(state));
  });

  /* The user has their own signature open. */
  await page.evaluate(() => {
    state.profile.name = 'My Own Work';
    saveDraft(state);
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.profile);
  await page.waitForTimeout(500);

  /* It asks, and keeps the local signature until answered. */
  await expect(page.locator('#modal-confirm')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => state.profile.name)).toBe('My Own Work');
  /* The parameter is gone, so a reload will not re-ask. */
  expect(page.url()).not.toContain('sig=');

  await page.click('#confirm-ok');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.profile.name)).toBe('Colleague Name');

  /* ↶ brings the user's own signature back. */
  await page.click('#btn-undo');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => state.profile.name)).toBe('My Own Work');
  await expectNoErrors(h);
});
