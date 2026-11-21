/* v0.68: dangerous URL schemes, format warnings, and long-token wrapping. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('dangerous URL schemes never reach an href', async ({ page }) => {
  const h = await freshPage(page);
  const res = await page.evaluate(() => {
    const norm = {};
    for (const v of ['javascript:alert(1)', 'vbscript:msgbox', 'data:text/html,<b>x</b>',
      'example.com', 'example.com:8080/x', 'https://ok.example.com', 'mailto:a@b.c']) {
      norm[v] = normalizeUrl('custom', v);
    }
    state.profile.company = 'Acme';
    state.contact.website = 'javascript:alert(1)';
    state.socials = [{ network: 'linkedin', url: 'javascript:alert(2)' }];
    const html = renderSignature(state);
    return {
      norm,
      hrefs: [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]),
    };
  });
  expect(res.norm['javascript:alert(1)']).toBe('');
  expect(res.norm['vbscript:msgbox']).toBe('');
  expect(res.norm['data:text/html,<b>x</b>']).toBe('');
  expect(res.norm['example.com']).toBe('https://example.com');
  expect(res.norm['example.com:8080/x']).toBe('https://example.com:8080/x');
  expect(res.norm['https://ok.example.com']).toBe('https://ok.example.com');
  expect(res.norm['mailto:a@b.c']).toBe('mailto:a@b.c');
  expect(res.hrefs.filter(x => /javascript:|vbscript:|data:text\/html/i.test(x))).toEqual([]);
  await expectNoErrors(h);
});

test('incomplete email, phone and website raise actionable warnings', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="contact.email"]', 'not-an-email');
  await page.fill('[data-field="contact.phone"]', 'abc');
  await page.fill('[data-field="contact.website"]', 'javascript:alert(1)');

  const targets = await page.evaluate(() => collectWarnings(state).map(w => w.target));
  expect(targets).toContain('contact.email');
  expect(targets).toContain('contact.phone');
  expect(targets).toContain('contact.website');

  /* Each one is a button in the checklist that jumps to its field. */
  await page.click('[data-check-target="contact.email"]');
  await expect(page.locator('[data-field="contact.email"]')).toBeVisible();
  await expectNoErrors(h);
});

test('a long unbroken company wraps instead of overflowing', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => {
    state.profile.company = 'ACME_' + 'X'.repeat(140);
    state.contact.website = 'https://acme.example.com/' + 'y'.repeat(160);
    rebuildAll();
  });
  await expect.poll(() => previewSrcdoc(page)).toContain('<wbr>');

  const overflow = await expect.poll(() => page.evaluate(() => {
    const f = document.querySelector('#preview-frame');
    const d = f.contentDocument;
    return d.body.scrollWidth - f.clientWidth;
  })).toBeLessThan(20);
  void overflow;

  /* The exported copy carries the same break opportunities (Outlook has no
     CSS word-wrap in the Word engine). */
  const html = await page.evaluate(() => renderSignature(state));
  expect(html).toContain('<wbr>');
  expect(html).toContain('word-wrap:break-word');

  /* And the checklist nudges the user about the long token. */
  const targets = await page.evaluate(() => collectWarnings(state).map(w => w.target));
  expect(targets).toContain('profile.company');
  await expectNoErrors(h);
});
