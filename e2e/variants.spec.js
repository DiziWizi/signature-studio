/* v0.90: layout variants — mirror, photo placement, compact spacing. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function withLogo(page) {
  await page.evaluate(png => {
    state.design.logoUrl = png;
    state.design.useMonogram = false;
    renderPreview();
  }, PNG_1PX);
}

function order(html, a, b) {
  return { a: html.indexOf(a), b: html.indexOf(b) };
}

test('mirroring swaps the columns in Classic and Photo card', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await withLogo(page);

  for (const tpl of ['classic', 'photocard']) {
    await page.evaluate(t => {
      state.design.template = t;
      state.design.mirrorLayout = false;
      renderPreview();
    }, tpl);
    const defaultHtml = await page.evaluate(() => renderSignaturePreview(state));
    const d = order(defaultHtml, 'data-edit="logo"', 'data-edit="name"');
    expect(d.a).toBeGreaterThan(-1);
    expect(d.a).toBeLessThan(d.b);

    await page.evaluate(() => {
      state.design.mirrorLayout = true;
      renderPreview();
    });
    const mirrored = await page.evaluate(() => renderSignaturePreview(state));
    const m = order(mirrored, 'data-edit="logo"', 'data-edit="name"');
    expect(m.b).toBeLessThan(m.a);
  }
  await expectNoErrors(h);
});

test('mirroring swaps the Academic contact column', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => { state.design.template = 'academic'; state.design.mirrorLayout = true; renderPreview(); });
  const html = await page.evaluate(() => renderSignaturePreview(state));
  /* Contact column comes first and aligns left when mirrored. */
  expect(html).toMatch(/<tr><td width="42%" align="left" valign="top">/);
  await expectNoErrors(h);
});

test('Photo card can put the photo above the name', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await withLogo(page);
  await page.evaluate(() => {
    state.design.template = 'photocard';
    state.design.photoLayout = 'top';
    renderPreview();
  });
  const html = await page.evaluate(() => renderSignaturePreview(state));
  const positions = order(html, 'data-edit="logo"', 'data-edit="name"');
  expect(positions.a).toBeLessThan(positions.b);
  /* A centred, full-width photo row rather than a side cell. */
  const row = html.slice(html.lastIndexOf('<tr>', positions.a), html.indexOf('</tr>', positions.a));
  expect(row).toContain('colspan="2"');
  expect(row).toContain('align="center"');
  await expectNoErrors(h);
});

test('Vertical card can put the photo beside the name', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await withLogo(page);
  await page.evaluate(() => {
    state.design.template = 'vertical';
    state.design.photoLayout = 'side';
    renderPreview();
  });
  const html = await page.evaluate(() => renderSignaturePreview(state));
  const logoAt = html.indexOf('data-edit="logo"');
  const rowStart = html.lastIndexOf('<tr>', logoAt);
  const rowEnd = html.indexOf('</tr>', logoAt);
  const row = html.slice(rowStart, rowEnd);
  expect(row).toContain('data-edit="name"');
  await expectNoErrors(h);
});

test('the compact switch drives the existing density setting', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const toggle = page.locator('#variant-compact');
  const select = page.locator('[data-field="design.density"]');

  await expect(select).toHaveValue('regular');
  await toggle.check();
  await expect.poll(() => page.evaluate(() => state.design.density)).toBe('compact');
  await expect(select).toHaveValue('compact');

  await select.selectOption('airy');
  await expect(toggle).not.toBeChecked();
  await expectNoErrors(h);
});

test('variants survive a save and reload', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.selectOption('[data-field="design.photoLayout"]', 'top');
  await page.check('[data-field="design.mirrorLayout"]');
  await page.evaluate(() => flushSave());

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__imagesReadyDone === true);
  const saved = await page.evaluate(() => ({
    photo: state.design.photoLayout,
    mirror: state.design.mirrorLayout,
  }));
  expect(saved.photo).toBe('top');
  expect(saved.mirror).toBe(true);
  await expectNoErrors(h);
});
