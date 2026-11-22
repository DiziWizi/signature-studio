/* Guard: never render a raw i18n key as visible text, in any locale.
   Keys are lowerCamel.dot.paths; catches a data-i18n that has no entry. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const LANGS = ['en', 'de', 'es', 'fr'];

for (const lang of LANGS) {
  test(`no raw i18n keys leak into the UI (${lang})`, async ({ page }) => {
    const h = await freshPage(page);
    await page.evaluate(l => {
      localStorage.setItem('sigstudio.lang', l);
    }, lang);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state && state.profile);

    /* Open every section and sub-group so nothing is skipped as hidden. */
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach(d => { d.open = true; });
    });

    const leaked = await page.evaluate(() => {
      const KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;
      const out = [];
      /* Only a fallback that equals the key is a leak — a domain such as
         "mailbox.org" or "gmail.com" also looks like a dotted key. */
      for (const el of document.querySelectorAll('[data-i18n]')) {
        const txt = (el.textContent || '').trim();
        const key = el.getAttribute('data-i18n');
        if (KEY.test(txt) && txt === key) out.push({ key, txt });
      }
      for (const el of document.querySelectorAll('[data-i18n-title],[data-i18n-ph],[data-i18n-aria]')) {
        for (const [a, k] of [['title', 'data-i18n-title'], ['placeholder', 'data-i18n-ph'], ['aria-label', 'data-i18n-aria']]) {
          const v = (el.getAttribute(a) || '').trim();
          const key = el.getAttribute(k);
          if (v && KEY.test(v) && v === key) out.push({ attr: a, txt: v });
        }
      }
      return out;
    });

    expect(leaked).toEqual([]);
    await expectNoErrors(h);
  });
}
