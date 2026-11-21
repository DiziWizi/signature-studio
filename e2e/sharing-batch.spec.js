/* v0.69: bulk filenames, share-link size, import heuristics, type coercion. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8137',
  });
});

test('bulk filenames are unique even when names collide', async ({ page }) => {
  const h = await freshPage(page);
  const res = await page.evaluate(() => {
    const csv = ['name,email',
      'Zoey DiZio,a@x.com',
      'Zoey DiZio,b@y.com',
      'Zoey DiZio,a@x.com',      /* exact duplicate row */
      'Alice,info@acme.com',
      'Bob,info@acme.com',
    ].join('\n');
    const out = bulkGenerate(state, csv);
    return { names: out.files.map(f => f.name), generated: out.generated, duplicates: out.duplicates || 0 };
  });
  const unique = new Set(res.names);
  expect(unique.size).toBe(res.names.length);      /* no ZIP entry collides */
  expect(res.duplicates).toBe(1);                  /* the exact repeat row */
  expect(res.names).toContain('zoey-dizio-a.html');
  expect(res.names).toContain('zoey-dizio-b.html');
  await expectNoErrors(h);
});

test('a huge share link says so, and the plain variant is small', async ({ page }) => {
  const h = await freshPage(page);
  await page.evaluate(() => {
    /* Incompressible bytes: a real photo, not a run of one character. */
    let bin = '';
    for (let i = 0; i < 120 * 1024; i += 65536) {
      const chunk = new Uint8Array(65536);
      crypto.getRandomValues(chunk);
      bin += String.fromCharCode.apply(null, chunk);
    }
    state.design.logoUrl = 'data:image/png;base64,' + btoa(bin);
    rebuildAll();
  });

  await page.click('#btn-export');
  await page.click('#x-share');
  await expect(page.locator('#toasts')).toContainText(/KB because it includes images/i);

  await page.click('#btn-export');
  await page.click('#x-share-plain');
  await expect(page.locator('#toasts')).toContainText(/Short link copied/i);

  const url = await page.evaluate(async () => (await navigator.clipboard.readText()));
  expect(url.length).toBeLessThan(3000);
  const decoded = await page.evaluate(u => {
    const raw = lzwDecode(new URL(u).searchParams.get('sig'));
    return JSON.parse(raw);
  }, url);
  expect(decoded.design.logoUrl).toBe('');
  await expectNoErrors(h);
});

test('past imports keep the phone and the company', async ({ page }) => {
  const h = await freshPage(page);
  const cases = {
    plain: 'Zoey Dizio<br>Engineer<br>Acme<br>zoey@example.com<br>+61 3 9000 0000',
    labelled: 'Zoey Dizio<br>Engineer<br>Acme<br>M: +61 400 111 222<br>zoey@example.com',
    telLink: 'Zoey Dizio<br><a href="tel:+61400111222">+61 400 111 222</a><br><a href="mailto:zoey@example.com">zoey@example.com</a>',
  };
  const out = {};
  for (const [k, html] of Object.entries(cases)) {
    out[k] = await page.evaluate(h2 => {
      const p = parseSignatureHTML(h2);
      return { name: p.profile.name, title: p.profile.title, company: p.profile.company, phone: p.contact.phone, email: p.contact.email };
    }, html);
  }
  expect(out.plain.phone).toBeTruthy();
  expect(out.plain.company).toBe('Acme');
  expect(out.plain.title).toBe('Engineer');
  expect(out.labelled.phone).toBeTruthy();
  expect(out.labelled.title).toBe('Engineer');       /* never the phone */
  expect(out.telLink.phone).toBeTruthy();
  await expectNoErrors(h);
});

test('malformed JSON types are coerced, never rendered as [object Object]', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const name = await page.evaluate(() => {
    const bad = JSON.parse(JSON.stringify(state));
    bad.profile.name = { evil: true };
    bad.profile.title = ['a', 'b'];
    bad.contact.email = 12345;
    bad.socials = 'not-an-array';
    bad.customLines = [{ label: { x: 1 }, value: ['y'] }, 'junk'];
    state = normalizeLoadedState(bad);
    rebuildAll();
    return { name: state.profile.name, email: state.contact.email, custom: state.customLines.length };
  });
  expect(name.name).toBe('');
  expect(name.email).toBe('12345');
  expect(name.custom).toBe(0);
  const html = await page.evaluate(() => renderSignature(state));
  expect(html).not.toContain('[object Object]');
  await expectNoErrors(h);
});
