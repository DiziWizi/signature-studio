/* v0.96: whole-library rendering matrix. Per-template baselines catch a
   single layout; these composites catch systemic changes (chips, RTL,
   strict Outlook, narrow stacking) across all 25 at once.
   Local-only, like the other visual baselines: CI font rasterisation differs. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helper');

test.skip(!!process.env.CI, 'visual baselines are local-only (font rasterisation differs on CI)');

const PAGE_CSS = `
  body { margin: 0; background: #eef1f5; font-family: Arial, Helvetica, sans-serif; }
  .matrix { width: 640px; padding: 20px; }
  .cell { background: #fff; padding: 12px; margin: 0 0 14px; border: 1px solid #c9d1dc; }
  .cell h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: .08em;
             text-transform: uppercase; color: #5b6472; font-weight: 600; }
  .sig { width: 600px; }
`;

async function collect(page, { rtl = false, strict = false } = {}) {
  return page.evaluate(({ rtl, strict }) => {
    const ids = [...document.querySelectorAll('.tpl-btn')].map(b => b.dataset.template);
    const saved = {
      template: state.design.template,
      direction: state.design.direction,
      strictOutlook: state.design.strictOutlook,
    };
    const out = ids.map(id => {
      state.design.template = id;
      state.design.direction = rtl ? 'rtl' : '';
      state.design.strictOutlook = !!strict;
      const doc = renderSignaturePreview(state);
      const m = doc.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      return { id, body: m ? m[1] : doc };
    });
    state.design.template = saved.template;
    state.design.direction = saved.direction;
    state.design.strictOutlook = saved.strictOutlook;
    return out;
  }, { rtl, strict });
}

async function paint(page, items) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head>
<body><div class="matrix">${items.map(it =>
    `<div class="cell"><h3>${it.id}</h3><div class="sig">${it.body}</div></div>`).join('')}</div></body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
}

test('the whole library survives RTL, strict Outlook and narrow widths', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1280, height: 900 });
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });

  /* Collect every variant BEFORE replacing the document: page.setContent
     destroys the app context, so a later collect() would have nothing to read. */
  const ltr = await collect(page);
  const rtl = await collect(page, { rtl: true });
  const strict = await collect(page, { strict: true });
  expect(ltr.length).toBe(25);

  await paint(page, ltr);
  await expect(page.locator('.matrix')).toHaveScreenshot('matrix-ltr.png', { maxDiffPixelRatio: 0.002 });

  await paint(page, rtl);
  await expect(page.locator('.matrix')).toHaveScreenshot('matrix-rtl.png', { maxDiffPixelRatio: 0.002 });

  await paint(page, strict);
  await expect(page.locator('.matrix')).toHaveScreenshot('matrix-strict.png', { maxDiffPixelRatio: 0.002 });

  await page.setViewportSize({ width: 375, height: 900 });
  const narrow = ltr;
  await paint(page, narrow.slice(0, 13));
  await expect(page.locator('.matrix')).toHaveScreenshot('matrix-narrow-a.png', { maxDiffPixelRatio: 0.002 });
  await paint(page, narrow.slice(13));
  await expect(page.locator('.matrix')).toHaveScreenshot('matrix-narrow-b.png', { maxDiffPixelRatio: 0.002 });

  expect(h.pageErrors).toEqual([]);
});
