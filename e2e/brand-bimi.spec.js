/* v0.82: brand asset pack, SVG Tiny PS, BIMI readiness (mocked DNS). */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.use({ acceptDownloads: true });

const SVG_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><script>alert(1)</script>' +
  '<a href="https://evil.example/x"><rect width="120" height="80" fill="#123456"/></a>' +
  '<image href="https://evil.example/p.png" width="10" height="10"/></svg>');

async function withSvg(page) {
  await page.evaluate(svg => {
    state.design.logoUrl = svg;
    renderPreview();
  }, SVG_LOGO);
}

test('the asset pack holds icons, a snippet and a README', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await withSvg(page);

  const pack = await page.evaluate(async () => {
    const files = await assetPackFiles();
    return {
      names: files.map(f => f.name),
      snippet: files.find(f => f.name === 'snippet.html').data,
      readme: files.find(f => f.name === 'README.txt').data,
      pngBytes: [...files.find(f => f.name === 'favicon-32.png').data].length,
    };
  });
  expect(pack.names).toEqual(expect.arrayContaining([
    'favicon-32.png', 'apple-touch-icon-180.png', 'icon-512.png',
    'favicon.svg', 'logo-bimi.svg', 'snippet.html', 'README.txt',
  ]));
  expect(pack.snippet).toContain('rel="icon"');
  expect(pack.readme).toMatch(/Microsoft[\s\S]*does not display/i);
  expect(pack.pngBytes).toBeGreaterThan(100);

  await page.click('#btn-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#x-asset-pack')]);
  expect(download.suggestedFilename()).toMatch(/brand-assets\.zip$/);
  await expectNoErrors(h);
});

test('the BIMI SVG conversion strips scripts and external references', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const out = await page.evaluate(() => {
    const raw = decodeURIComponent(/^data:image\/svg\+xml;utf8,(.*)$/.exec(
      'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><script>alert(1)</script><a href="https://evil.example/x"><rect width="120" height="80" fill="#123456"/></a></svg>')
    )[1]);
    return svgToTinyPs(raw);
  });
  expect(out).toContain('baseProfile="tiny-ps"');
  expect(out).not.toContain('<script');
  expect(out).not.toContain('evil.example');
  const vb = /viewBox="([^"]+)"/.exec(out)[1].split(/\s+/).map(Number);
  expect(vb[2]).toBe(vb[3]); /* square canvas */

  /* A raster logo cannot produce a BIMI SVG. */
  await page.evaluate(() => {
    state.design.logoUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    doBimiSvg();
  });
  await expect(page.locator('#toasts')).toContainText(/BIMI needs an SVG logo/i);
  await expectNoErrors(h);
});

async function mockDns(page, map) {
  await page.route('**/dns.google/**', route => {
    const name = new URL(route.request().url()).searchParams.get('name');
    const answer = map[name];
    return route.fulfill({
      status: 200,
      contentType: 'application/dns-json',
      body: JSON.stringify(answer ? { Status: 0, Answer: answer } : { Status: 3, Answer: [] }),
    });
  });
}

test('BIMI check passes with enforced DMARC and a full record', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await mockDns(page, {
    '_dmarc.example.com': [{ type: 16, data: '"v=DMARC1; p=reject; rua=mailto:d@example.com"' }],
    'default._bimi.example.com': [{ type: 16, data: '"v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem"' }],
  });

  await page.evaluate(() => openBimi());
  await expect(page.locator('#modal-bimi')).not.toHaveClass(/hidden/);
  await page.fill('#bimi-domain', 'https://example.com/path');
  await page.click('#bimi-check');

  await expect(page.locator('#bimi-results')).toContainText('p=reject');
  await expect(page.locator('#bimi-results')).toContainText('https://example.com/logo.svg');
  await expect(page.locator('.bimi-verdict')).toHaveClass(/pass/);
  await expect(page.locator('#bimi-copy')).toBeEnabled();
  await expect(page.locator('#bimi-record-text')).toContainText('default._bimi.example.com');

  await page.click('#bimi-copy');
  await expect(page.locator('#toasts')).toContainText(/DNS record copied/i);
  await expectNoErrors(h);
});

test('BIMI check fails loudly when DMARC is p=none and no record exists', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await mockDns(page, {
    '_dmarc.example.com': [{ type: 16, data: '"v=DMARC1; p=none"' }],
  });

  await page.evaluate(() => openBimi());
  await page.fill('#bimi-domain', 'example.com');
  await page.click('#bimi-check');

  await expect(page.locator('.bimi-verdict')).toHaveClass(/fail/);
  await expect(page.locator('#bimi-results')).toContainText('p=none');
  await expect(page.locator('#bimi-results')).toContainText(/not found/i);
  await expect(page.locator('#bimi-results')).toContainText(/Microsoft does not display BIMI/i);
  await expectNoErrors(h);
});

test('an invalid domain is rejected without a lookup', async ({ page }) => {
  const h = await freshPage(page);
  let calls = 0;
  await page.route('**/dns.google/**', route => { calls += 1; return route.abort(); });

  await page.evaluate(() => openBimi());
  await page.fill('#bimi-domain', 'not a domain');
  await page.click('#bimi-check');
  await expect(page.locator('#bimi-results')).toContainText(/Enter a domain like example\.com/i);
  expect(calls).toBe(0);
  await expectNoErrors(h);
});
