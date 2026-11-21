/* v0.71: the shipped nginx.conf is the contract self-hosters inherit.
   This spec reads it, applies its CSP to the app and proves the app still
   works under it — so a hardened deployment is never a surprise. */
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc } = require('./helper');

const NGINX = fs.readFileSync(path.join(__dirname, '..', 'nginx.conf'), 'utf8');
const CSP = (NGINX.match(/Content-Security-Policy "([^"]+)"/) || [])[1];

test('nginx.conf carries the headers a hardened self-host needs', () => {
  expect(CSP).toBeTruthy();
  expect(CSP).toContain("default-src 'self'");
  expect(CSP).toContain("script-src 'self' 'unsafe-inline'");
  expect(CSP).toContain("style-src 'self' 'unsafe-inline'");
  expect(CSP).toContain("frame-ancestors 'none'");
  expect(NGINX).toContain('X-Frame-Options DENY');
  expect(NGINX).toContain('Permissions-Policy');
  /* Dev material is denied even if someone bind-mounts a checkout. */
  expect(NGINX).toMatch(/\^\/\(e2e\|docs\|tools\|tests/);
});

test('the nginx deny rules block dev paths and leave the app alone', () => {
  /* Same regexes as nginx.conf (PCRE and JS agree on these). */
  const devPath = /^\/(e2e|docs|tools|tests|\.forgejo|test-results)\//;
  const dotPath = /\/\./;
  for (const bad of ['/e2e/a11y.spec.js', '/docs/roadmap.md', '/test-results/x.png',
    '/tools/publish_release.py', '/tests/foo.js', '/.forgejo/workflows/release.yml', '/.git/config']) {
    expect(bad).toMatch(devPath.test(bad) ? devPath : dotPath);
  }
  for (const ok of ['/', '/index.html', '/sw.js', '/assets/js/app.js', '/assets/icons/icon-192.png',
    '/manifest.webmanifest']) {
    expect(devPath.test(ok)).toBe(false);
    expect(dotPath.test(ok)).toBe(false);
  }
});

test('the app works under that exact CSP', async ({ page }) => {
  const violations = [];
  page.on('console', m => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.route('**/*', async route => {
    if (route.request().resourceType() === 'document') {
      const resp = await route.fetch();
      await route.fulfill({
        response: resp,
        headers: Object.assign({}, resp.headers(), {
          'content-security-policy': CSP,
          'x-frame-options': 'DENY',
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('http://127.0.0.1:8137/?csp=1', { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.setItem('sigstudio.wizard.done', '1');
    localStorage.setItem('sigstudio.tour.done', '1');
    localStorage.setItem('sigstudio.mode', 'advanced');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.profile);

  /* Rendered and interactive. */
  await page.click('#btn-sample');
  await expect.poll(() => previewSrcdoc(page)).toContain('Ada Lovelace');
  expect(await page.evaluate(() => document.querySelectorAll('[data-field]').length)).toBeGreaterThan(100);

  /* The preview reporter (inline script in srcdoc) still runs: clicking the
     name flashes its field. This is the thing a stricter CSP would break. */
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('#preview-frame').contentDocument.querySelectorAll('[data-edit]').length
  )).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.querySelector('#preview-frame').contentDocument.querySelector('[data-edit="name"]').click();
  });
  await expect.poll(() => page.evaluate(() => {
    const input = document.querySelector('[data-field="profile.name"]');
    const box = input && input.closest('.field, label');
    return !!(box && box.classList.contains('flash'));
  })).toBe(true);

  /* And no inline-style noise: the policy is written for this app. */
  expect(violations).toEqual([]);
});
