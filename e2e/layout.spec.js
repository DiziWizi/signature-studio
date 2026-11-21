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

test('design section grid never overflows horizontally', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const m = await page.evaluate(() => {
    /* Every section's grid, not just Design — the same track-minimum
       trap applies wherever a long control label lives in a grid2. */
    const secs = [...document.querySelectorAll('details[data-sec]')];
    const grids = secs.flatMap(s => [...s.querySelectorAll('.grid2')]);
    const widest = Math.max(0, ...grids.map(g => g.scrollWidth - g.clientWidth));
    const fields = secs.flatMap(s => [...s.querySelectorAll('.field, .url-row')])
      .map(el => el.scrollWidth - el.clientWidth)
      .filter(d => d > 1);
    const sections = secs.map(s => s.scrollWidth - s.clientWidth).filter(d => d > 1);
    return {
      gridCount: grids.length,
      maxGridOverflow: widest,
      overflowingFields: fields.length,
      overflowingSections: sections.length,
    };
  });

  expect(m.gridCount).toBeGreaterThan(0);
  /* Tracks must shrink with the sidebar — the cloned column used to be
     clipped by details{overflow:hidden} because a long <option> or a
     fixed-width control set a track's min-content wider than half the
     pane. */
  expect(m.maxGridOverflow).toBeLessThanOrEqual(1);
  expect(m.overflowingFields).toBe(0);
  expect(m.overflowingSections).toBe(0);

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
