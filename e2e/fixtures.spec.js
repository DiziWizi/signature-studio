/* Browser-side import fixture tests (tests/import-fixtures.js): fetch
   socials.js + import.js + fixtures into the page, run them in one Function
   scope (same trick the fixtures file itself describes). */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('runImportFixtureTests passes all 4 fixtures', async ({ page }) => {
  const h = await freshPage(page);

  const result = await page.evaluate(async () => {
    const fetchText = async url => (await fetch(url)).text();
    const socialsSrc = await fetchText('/assets/js/socials.js');
    const importSrc = await fetchText('/assets/js/import.js');
    const fixturesSrc = await fetchText('/tests/import-fixtures.js');
    const runner = new Function(
      socialsSrc + '\n' + importSrc + '\n' + fixturesSrc + '\n;return runImportFixtureTests();'
    );
    return runner();
  });

  expect(result.passed).toBe(4);
  expect(result.failed).toBe(0);
  expect(result.results.map(r => r.name)).toEqual([
    'gmail-basic', 'gmail-image', 'outlook-desktop', 'apple-mail',
  ]);
  await expectNoErrors(h);
});
