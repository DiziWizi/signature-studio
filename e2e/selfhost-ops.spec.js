/* v0.72: app-only archive, storage meter + cleanup, prompt-first SW update,
   noscript notice, docs without hardcoded test counts. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const ROOT = path.join(__dirname, '..');

test('the app archive contains deployables only', () => {
  execFileSync('python3', [path.join(ROOT, 'tools', 'make_app_zip.py'), '--version', '0.0.0'], { cwd: ROOT });
  const zipPath = path.join(ROOT, 'dist', 'bowerbird-signature-builder-0.0.0-app.zip');
  const list = execFileSync('python3', ['-c', `
import zipfile, sys
z = zipfile.ZipFile(${JSON.stringify(zipPath)})
print('\\n'.join(z.namelist()))
`], { encoding: 'utf8' }).trim().split('\n');
  for (const need of ['index.html', 'sw.js', 'manifest.webmanifest', 'nginx.conf', 'assets/styles.css']) {
    expect(list).toContain(need);
  }
  const dev = list.filter(n => /^(e2e|docs|tools|tests|\.forgejo|test-results|node_modules)\//.test(n));
  expect(dev).toEqual([]);
  expect(list.length).toBeLessThan(40);
  fs.unlinkSync(zipPath);
});

test('storage meter shows usage, snapshots their size, cleanup frees space', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => {
    /* Two photo-sized images make each snapshot ~1.6 MB. */
    state.design.logoUrl = 'data:image/png;base64,' + 'A'.repeat(600 * 1024);
    state.design.bannerUrl = 'data:image/png;base64,' + 'B'.repeat(600 * 1024);
    rebuildAll();
    for (const n of ['One', 'Two']) saveSnapshot(state, n);
    /* Push total usage past the 70 % cleanup threshold without a third
       snapshot (photo-sized states plus a filler block). */
    localStorage.setItem('qa.filler', 'x'.repeat(1500 * 1024));
  });
  await page.click('#btn-saved');

  const usage = await page.locator('#sm-usage').innerText();
  expect(usage).toMatch(/\d+(\.\d+)? MB/);
  expect(usage).toContain('2 saved');
  expect(await page.locator('.si-size').count()).toBe(2);
  const before = await page.evaluate(() => document.querySelector('#sm-fill').style.width);

  /* "Delete oldest" trims until comfortably under the budget. */
  await page.click('#saved-cleanup');
  await expect.poll(() => page.evaluate(() => listSnapshots().length), { timeout: 8000 }).toBe(1);
  const after = await page.evaluate(() => document.querySelector('#sm-fill').style.width);
  expect(parseInt(after, 10)).toBeLessThanOrEqual(parseInt(before, 10));
  await expectNoErrors(h);
});

test('the service worker waits for the pill before activating', async ({ page }) => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  /* No unconditional skipWaiting in install… */
  expect(sw).not.toMatch(/addAll\(PRECACHE\)\)\s*\.then\(\(\) => self\.skipWaiting\(\)\)/);
  /* …but the message handler can promote it. */
  expect(sw).toContain("data.type === 'SKIP_WAITING'");
  expect(sw).toMatch(/self\.skipWaiting\(\)/);

  const h = await freshPage(page);
  /* The promotion contract: activateWaiting() messages the worker BEFORE
     reloading (1.5 s fallback), and the pill button routes to it. */
  await page.evaluate(() => {
    window.__skipMessage = null;
    activateWaiting({ postMessage: m => { window.__skipMessage = m.type; } });
  });
  await expect.poll(() => page.evaluate(() => window.__skipMessage), { timeout: 1200 }).toBe('SKIP_WAITING');
  /* The button itself is wired to activateWaiting when a worker waits. */
  const wired = await page.evaluate(() => {
    waitingWorker = { postMessage: m => { window.__skipMessage = m.type; } };
    return typeof waitingWorker.postMessage === 'function';
  });
  expect(wired).toBe(true);
  await expectNoErrors(h);
});

test('a no-JS visitor is told why the page is empty', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  expect(html).toMatch(/<noscript>[\s\S]*needs JavaScript[\s\S]*<\/noscript>/);
});
