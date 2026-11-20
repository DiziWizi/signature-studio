/* v0.52: layout regression — the sidebar must scroll INTERNALLY on
   desktop instead of clipping at the fold, and single-column narrow
   widths must scroll the page as a whole. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('desktop: sidebar scrolls internally, page has no scrollbar', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const m = await page.evaluate(() => {
    const editor = document.querySelector('.editor');
    const layout = document.querySelector('.layout');
    const footer = document.querySelector('.app-footer');
    return {
      vh: window.innerHeight,
      bodyScrollH: document.body.scrollHeight,
      editorOverflowY: getComputedStyle(editor).overflowY,
      editorScrollable: editor.scrollHeight > editor.clientHeight,
      layoutBottom: Math.round(layout.getBoundingClientRect().bottom),
      footerTop: Math.round(footer.getBoundingClientRect().top),
      footerBottom: Math.round(footer.getBoundingClientRect().bottom),
    };
  });

  /* The editor is its own scroll region with real content to scroll. */
  expect(m.editorOverflowY).toBe('auto');
  expect(m.editorScrollable).toBe(true);
  /* The app row ends where the version footer begins. */
  expect(Math.abs(m.footerTop - m.layoutBottom)).toBeLessThanOrEqual(2);
  /* The footer closes the viewport exactly — no page scrollbar. */
  expect(Math.abs(m.footerBottom - m.vh)).toBeLessThanOrEqual(2);
  expect(m.bodyScrollH).toBe(m.vh);

  /* Scrolling the editor to the bottom reaches the last design control. */
  const reachable = await page.evaluate(() => {
    const editor = document.querySelector('.editor');
    editor.scrollTop = editor.scrollHeight;
    return editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 2;
  });
  expect(reachable).toBe(true);

  await expectNoErrors(h);
});

test('narrow: single-column layout scrolls the page as a whole', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const m = await page.evaluate(() => {
    const editor = document.querySelector('.editor');
    const layout = document.querySelector('.layout');
    return {
      bodyScrollH: document.body.scrollHeight,
      vh: window.innerHeight,
      layoutH: Math.round(layout.getBoundingClientRect().height),
      editorOverflowY: getComputedStyle(editor).overflowY,
    };
  });

  /* The page grows past the viewport (normal page scroll). */
  expect(m.bodyScrollH).toBeGreaterThan(m.vh);
  expect(m.editorOverflowY).toBe('visible');
  expect(m.layoutH).toBeGreaterThan(m.vh);

  await expectNoErrors(h);
});
