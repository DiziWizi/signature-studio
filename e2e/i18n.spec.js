/* i18n layer: English-default equivalence, live language switching via the
   topbar select, localStorage persistence, navigator.language auto-detect,
   leaf-element integrity of every data-i18n target, and zero console errors
   throughout. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('defaults to English and renders the key UI strings', async ({ page }) => {
  const h = await freshPage(page);

  await expect(page.locator('#lang-select')).toHaveValue('en');
  await expect(page.locator('#btn-sample')).toHaveText('Sample data');
  await expect(page.locator('[data-i18n="field.name"]')).toHaveText('Full name');
  await expect(page.locator('[data-i18n="tpl.classic"]')).toHaveText('Classic');

  await page.click('#btn-guide');
  await expect(page.locator('#wizard-title')).toHaveText('Let\u2019s set you up');
  await expect(page.locator('#wiz-step-label')).toHaveText('Step 1 of 3');
  await page.keyboard.press('Escape');

  await expectNoErrors(h);
});

test('switching to German translates the UI live and survives a reload', async ({ page }) => {
  const h = await freshPage(page);

  await page.selectOption('#lang-select', 'de');
  await expect(page.locator('#btn-sample')).toHaveText('Beispieldaten');
  await expect(page.locator('[data-i18n="field.name"]')).toHaveText('Vollständiger Name');
  await expect(page.locator('[data-i18n="sec.profile"]')).toHaveText('Profil');
  await expect(page.locator('[data-i18n="tpl.classic"]')).toHaveText('Klassisch');
  /* Dynamic re-renders follow the language too. */
  await expect(page.locator('#checklist')).toContainText('Kein Name gesetzt');
  await expect(page.locator('#conciseness')).toContainText('Zeilen');

  await page.click('#btn-guide');
  await expect(page.locator('#wizard-title')).toHaveText('Richten wir Sie ein');
  await expect(page.locator('#wiz-step-label')).toHaveText('Schritt 1 von 3');
  await page.keyboard.press('Escape');

  /* The choice persists in localStorage and survives a reload. */
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#lang-select')).toHaveValue('de');
  await expect(page.locator('#btn-sample')).toHaveText('Beispieldaten');
  await expect(page.locator('#modal-wizard')).toHaveClass(/hidden/);

  await expectNoErrors(h);
});

test('switching back to English restores the original strings', async ({ page }) => {
  const h = await freshPage(page);

  await page.selectOption('#lang-select', 'fr');
  await expect(page.locator('#btn-sample')).toHaveText('Données d\u2019exemple');

  await page.selectOption('#lang-select', 'en');
  await expect(page.locator('#btn-sample')).toHaveText('Sample data');
  await expect(page.locator('[data-i18n="field.name"]')).toHaveText('Full name');
  await expect(page.locator('[data-i18n="sec.contact"]')).toHaveText('Contact details');

  await expectNoErrors(h);
});

test('every data-i18n target is a leaf element and every translation is non-empty', async ({ page }) => {
  const h = await freshPage(page);

  /* textContent targets must contain no element children (else applyI18n
     would wipe nested controls). */
  const nonLeaf = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      if ([...el.children].some(c => c.nodeType === 1)) bad.push(el.dataset.i18n);
    });
    return bad;
  });
  expect(nonLeaf).toEqual([]);

  for (const lang of ['de', 'es', 'fr']) {
    await page.selectOption('#lang-select', lang);
    const empty = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll(
        '[data-i18n], [data-i18n-html], [data-i18n-title], [data-i18n-aria]'
      ).forEach(el => {
        const key = el.dataset.i18n || el.dataset.i18nHtml || el.dataset.i18nTitle || el.dataset.i18nAria;
        let val = '';
        if (el.dataset.i18n !== undefined) {
          val = el.tagName === 'META' ? el.getAttribute('content') : el.textContent;
        } else if (el.dataset.i18nHtml !== undefined) {
          val = el.innerHTML;
        } else if (el.dataset.i18nTitle !== undefined) {
          val = el.getAttribute('title');
        } else {
          val = el.getAttribute('aria-label');
        }
        if (!val || !String(val).trim()) bad.push(key);
      });
      return bad;
    });
    expect(empty, `empty or missing translations in ${lang}`).toEqual([]);
  }

  await page.selectOption('#lang-select', 'en');
  await expectNoErrors(h);
});

test('browser language auto-detection picks the matching locale', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const h = await freshPage(page);

  await expect(page.locator('#lang-select')).toHaveValue('de');
  await expect(page.locator('#btn-sample')).toHaveText('Beispieldaten');

  await expectNoErrors(h);
  await context.close();
});
