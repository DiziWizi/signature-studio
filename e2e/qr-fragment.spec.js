/* v0.27: inline vCard QR + bare table fragment export. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8137',
  });
});

test('showQr embeds a table-grid QR in Classic, not in the other templates', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.locator('label.switch:has(input[data-field="design.showQr"])').click();
  await expect.poll(async () => (await previewSrcdoc(page)).match(/background-color:#000000/g)?.length || 0)
    .toBeGreaterThan(100); /* the QR grid is thousands of cells */
  await expect(page.locator('#checklist')).toContainText('embedded QR');

  /* Other templates stay QR-free (the X chip is a single black cell). */
  await page.click('.tpl-btn[data-template="minimal"]');
  await expect.poll(async () => (await previewSrcdoc(page)).match(/background-color:#000000/g)?.length || 0)
    .toBeLessThan(10);

  await expectNoErrors(h);
});

test('Copy table fragment puts the bare <table> on the clipboard', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-export');
  await expect(page.locator('#export-menu')).not.toHaveClass(/hidden/);
  await page.click('#x-copy-fragment');
  await expect(page.locator('#toasts')).toContainText('Table fragment');

  let clipHtml = '';
  await expect
    .poll(async () => {
      clipHtml = await page.evaluate(async () => {
        try {
          const items = await navigator.clipboard.read();
          const item = items.find(i => i.types.includes('text/html'));
          return item ? (await item.getType('text/html')).text() : '';
        } catch (e) {
          return '';
        }
      });
      return clipHtml;
    })
    .toContain('<table');

  expect(clipHtml).toContain('Ada Lovelace');
  expect(clipHtml).not.toContain('<!DOCTYPE');
  expect(clipHtml).not.toContain('<html');
  expect(clipHtml).not.toContain('<body');

  await expectNoErrors(h);
});
