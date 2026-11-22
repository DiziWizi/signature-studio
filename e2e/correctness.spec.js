/* v0.83: portrait split, compatibility check, reorder focus. */
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PORTRAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#ff00aa"/></svg>');

test('photo-led templates prefer the portrait over the logo', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(({ logo, portrait }) => {
    state.design.logoUrl = logo;
    state.design.portraitUrl = portrait;
    state.design.template = 'roundel';
    renderPreview();
  }, { logo: PNG_1PX, portrait: PORTRAIT });

  const html = await page.evaluate(() => renderSignature(state));
  expect(html).toContain('ff00aa');
  /* Classic still shows the brand logo. */
  await page.click('.tpl-btn[data-template="classic"]');
  const classic = await page.evaluate(() => renderSignature(state));
  expect(classic).not.toContain('ff00aa');
  await expectNoErrors(h);
});

test('the vCard photo follows the portrait', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(p => {
    state.design.logoUrl = ''; /* only the portrait exists */
    state.design.portraitUrl = p;
  }, PNG_1PX);

  await page.click('#btn-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#x-vcard')]);
  const text = fs.readFileSync(await download.path(), 'utf8').replace(/\r?\n /g, '');
  expect(text).toMatch(/PHOTO;ENCODING=b;TYPE=(JPEG|PNG)/);
  await expectNoErrors(h);
});

test('the compatibility scan catches Word-engine and Gmail hazards', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const issues = await page.evaluate(() => compatIssues(state, [
    '<style>@font-face{font-family:x;src:url(y)}</style>',
    '<div style="display:flex;position:absolute;background-image:url(https://x/y.png)">',
    '<img src="https://example.com/a.png"><script>1</script></div>',
  ].join('')).map(i => ({ level: i.level, key: i.key })));
  const keys = issues.map(i => i.key);
  expect(keys).toEqual(expect.arrayContaining([
    'compat.styleBlock', 'compat.fontFace', 'compat.layout',
    'compat.background', 'compat.remote', 'compat.script', 'compat.alt',
  ]));
  expect(issues.filter(i => i.level === 'fail').length).toBeGreaterThanOrEqual(4);
  await expectNoErrors(h);
});

test('the modal lists issues and strict mode clears the rounding advice', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-export');
  await page.click('#x-compat');
  await expect(page.locator('#modal-compat')).not.toHaveClass(/hidden/);
  await expect(page.locator('#compat-results .compat-row.info')).toHaveCount(1);
  await expect(page.locator('#compat-results .compat-row.fail')).toHaveCount(0);

  await page.click('#compat-results [data-fix="strict"]');
  await expect.poll(() => page.evaluate(() => state.design.strictOutlook)).toBe(true);
  await expect(page.locator('#compat-results .compat-row.info')).toHaveCount(0);
  await expect(page.locator('#compat-results')).toContainText(/Everything checks out|checks out/i);
  await expectNoErrors(h);
});

test('a hard failure gates the copy action until acknowledged', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const h = await freshPage(page);
  await page.click('#btn-sample');
  /* Push the HTML past Gmail's clip limit. */
  await page.evaluate(() => {
    state.profile.tagline = 'Long tagline. '.repeat(9000);
    renderPreview();
  });

  await page.click('#btn-export');
  await page.click('#x-copy');
  await expect(page.locator('#modal-compat')).not.toHaveClass(/hidden/);
  await expect(page.locator('#compat-results .compat-row.fail')).not.toHaveCount(0);
  await expect(page.locator('#compat-continue')).toBeVisible();

  await page.click('#compat-continue');
  await expect(page.locator('#modal-compat')).toHaveClass(/hidden/);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('Ada Lovelace');
  await expectNoErrors(h);
});

test('moving a row keeps keyboard focus on the row', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => document.querySelector('#socials-list .social-row').scrollIntoView());

  await page.click('.social-row[data-i="0"] .soc-down');
  const active = await page.evaluate(() => document.activeElement && document.activeElement.className);
  expect(active).toContain('soc-down');

  await page.evaluate(() => {
    state.design.template = 'custom';
    updateTemplatePicker();
    renderBlockList();
  });
  await page.click('#blocks-list .block-row[data-block="identity"] [data-dir="1"]');
  const blockFocus = await page.evaluate(() => ({
    dir: document.activeElement && document.activeElement.getAttribute('data-dir'),
    row: document.activeElement && document.activeElement.closest('.block-row') && document.activeElement.closest('.block-row').dataset.block,
  }));
  expect(blockFocus.dir).toBe('1');
  expect(blockFocus.row).toBe('identity');
  await expectNoErrors(h);
});
