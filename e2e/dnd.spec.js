/* Social list drag-and-drop: HTML5 DnD via the .row-drag handle.
 *
 * Technique: locator.dragTo() on the handle. Playwright drives Chromium's
 * native drag pipeline (mouse down on the source → intercepted native
 * dragstart → Input.dispatchDragEvent dragEnter/dragOver/drop at the target
 * point), so the app's real dragstart/dragover/drop handlers run with a
 * real e.target (the handle) and real clientY coordinates. Verified with
 * an event-trace probe: dragstart targets .row-drag, dragover/drop target
 * the hovered row with the .drop-below/.drop-above mark the app sets from
 * clientY vs the row's vertical midpoint. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors, previewSrcdoc } = require('./helper');

const URLS = {
  linkedin: 'https://www.linkedin.com/in/dnd-user',
  github: 'https://github.com/dnd-user',
  x: 'https://x.com/dnd_user',
};

async function addSocial(page, network, url) {
  await page.click('#add-social');
  const row = page.locator('.social-row').last();
  if (network !== 'linkedin') await row.locator('.soc-net').selectOption(network);
  await row.locator('.soc-url').fill(url);
}

/* Drag one row's .row-drag handle onto another row. The drag must start on
   the handle (the app's dragstart handler filters on e.target === .row-drag).
   dropAtBottom places the cursor in the bottom half of the target row —
   below its vertical midpoint — so the app marks it .drop-below
   (beforeIndex = rowIndex + 1); otherwise the cursor lands in the top half
   (.drop-above, beforeIndex = rowIndex). */
async function dragHandleOntoRow(page, fromIdx, ontoIdx, dropAtBottom) {
  const handle = page.locator('.social-row').nth(fromIdx).locator('.row-drag');
  const target = page.locator('.social-row').nth(ontoIdx);
  const box = await target.boundingBox();
  await handle.dragTo(target, {
    targetPosition: { x: 10, y: dropAtBottom ? box.height - 2 : 2 },
  });
}

/* state.socials is a top-level `let` in the classic-script app.js, i.e. a
   global lexical binding — readable from page.evaluate. */
const stateNetworks = page => page.evaluate(() => state.socials.map(s => s.network));
const domNetworks = page =>
  page.locator('.social-row .soc-net').evaluateAll(els => els.map(e => e.value));

/* Preview order: the socials row renders one chip (glyph + href) per social
   in state.socials order (socialsRowHtml in templates.js), so the srcdoc
   index of each chip's URL proves the rendered network order. */
async function expectPreviewOrder(page, firstUrl, secondUrl) {
  let srcdoc = '';
  await expect.poll(async () => (srcdoc = await previewSrcdoc(page))).toContain(firstUrl);
  expect(
    srcdoc.indexOf(firstUrl),
    `preview should render ${firstUrl} before ${secondUrl}`
  ).toBeLessThan(srcdoc.indexOf(secondUrl));
}

test('socials drag & drop: dragging the second row above the first reorders state, DOM and preview', async ({ page }) => {
  const h = await freshPage(page);
  await addSocial(page, 'linkedin', URLS.linkedin);
  await addSocial(page, 'github', URLS.github);
  await expect(page.locator('.social-row')).toHaveCount(2);

  await expect.poll(() => stateNetworks(page)).toEqual(['linkedin', 'github']);
  await expectPreviewOrder(page, URLS.linkedin, URLS.github);

  /* Drag the GitHub row's handle onto the LinkedIn row, cursor in the top
     half (.drop-above → insert before index 0). */
  await dragHandleOntoRow(page, 1, 0, false);

  await expect.poll(() => stateNetworks(page)).toEqual(['github', 'linkedin']);
  await expect.poll(() => domNetworks(page)).toEqual(['github', 'linkedin']);
  await expectPreviewOrder(page, URLS.github, URLS.linkedin);

  await expectNoErrors(h);
});

test('socials drag & drop: dragging back restores the original order', async ({ page }) => {
  const h = await freshPage(page);
  await addSocial(page, 'linkedin', URLS.linkedin);
  await addSocial(page, 'github', URLS.github);

  /* Reorder via drag, then drag the swapped row back up. */
  await dragHandleOntoRow(page, 1, 0, false);
  await expect.poll(() => stateNetworks(page)).toEqual(['github', 'linkedin']);

  await dragHandleOntoRow(page, 1, 0, false);
  await expect.poll(() => stateNetworks(page)).toEqual(['linkedin', 'github']);
  await expect.poll(() => domNetworks(page)).toEqual(['linkedin', 'github']);
  await expectPreviewOrder(page, URLS.linkedin, URLS.github);

  await expectNoErrors(h);
});

test('socials drag & drop: dropping a row below a later row moves it down (3 rows)', async ({ page }) => {
  const h = await freshPage(page);
  await addSocial(page, 'linkedin', URLS.linkedin);
  await addSocial(page, 'github', URLS.github);
  await addSocial(page, 'x', URLS.x);

  /* Drag row 0 (LinkedIn) below row 2 (X): cursor in the bottom half →
     .drop-below → beforeIndex 3 → a two-slot downward move. */
  await dragHandleOntoRow(page, 0, 2, true);
  await expect.poll(() => stateNetworks(page)).toEqual(['github', 'x', 'linkedin']);
  await expect.poll(() => domNetworks(page)).toEqual(['github', 'x', 'linkedin']);
  await expectPreviewOrder(page, URLS.github, URLS.linkedin);

  /* Drag LinkedIn back above row 0. */
  await dragHandleOntoRow(page, 2, 0, false);
  await expect.poll(() => stateNetworks(page)).toEqual(['linkedin', 'github', 'x']);
  await expectPreviewOrder(page, URLS.linkedin, URLS.github);

  await expectNoErrors(h);
});

/* The exact gesture from the original request: drag the first row's handle
   onto the second row with the drop below the second row. This is a
   one-slot downward move (beforeIndex = from + 2 before the decrement) and
   must reorder — it used to be a silent no-op (finishDrag guard). */
test('socials drag & drop: dropping row 0 below row 1 moves it down one slot', async ({ page }) => {
  const h = await freshPage(page);
  await addSocial(page, 'linkedin', URLS.linkedin);
  await addSocial(page, 'github', URLS.github);

  await dragHandleOntoRow(page, 0, 1, true);

  await expect.poll(() => stateNetworks(page)).toEqual(['github', 'linkedin']);
  await expect.poll(() => domNetworks(page)).toEqual(['github', 'linkedin']);
  await expectPreviewOrder(page, URLS.github, URLS.linkedin);

  await expectNoErrors(h);
});
