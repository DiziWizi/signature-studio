/* v0.75: bulk preview table + per-field import acceptance. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('bulk plan classifies rows and names every file', async ({ page }) => {
  const h = await freshPage(page);
  const plan = await page.evaluate(() => {
    const csv = ['name,email,title',
      'Ada Lovelace,ada@example.com,Head of Analytics',
      'Bob,bob@example.com,Dev',
      'Bob,bob@example.com,Dev',
      ',noname@example.com,Title',
      'No Email,,Title',
    ].join('\n');
    const p = bulkPlan(state, csv);
    return { delimiter: p.delimiter, rows: p.rows.map(r => ({ line: r.line, name: r.name, status: r.status, file: r.filename })) };
  });
  expect(plan.delimiter).toBe(',');
  expect(plan.rows.map(r => r.status)).toEqual(['ready', 'ready', 'duplicate', 'noName', 'noEmail']);
  expect(plan.rows[0].file).toBe('ada-lovelace-ada.html');
  expect(plan.rows[1].file).toBe('bob-bob.html');
  expect(plan.rows[2].file).toBe('');
  await expectNoErrors(h);
});

test('semicolon and BOM CSVs parse', async ({ page }) => {
  const h = await freshPage(page);
  const res = await page.evaluate(() => {
    const semi = 'name;email;company\nAda;ada@example.com;Acme';
    const bom = '\uFEFFname,email\nBob;bob@example.com'.replace(';', ',');
    return {
      semi: bulkPlan(state, semi).rows.map(r => ({ name: r.name, email: r.email, status: r.status })),
      semiDelim: bulkPlan(state, semi).delimiter,
      bom: bulkPlan(state, bom).rows.map(r => ({ name: r.name, status: r.status })),
    };
  });
  expect(res.semiDelim).toBe(';');
  expect(res.semi[0]).toMatchObject({ name: 'Ada', email: 'ada@example.com', status: 'ready' });
  expect(res.bom[0]).toMatchObject({ name: 'Bob', status: 'ready' });
  await expectNoErrors(h);
});

test('the bulk modal previews rows and reasons before generating', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-export');
  await page.click('#x-bulk');
  await page.fill('#bulk-csv', 'name,email\nAda,ada@example.com\nBob,bob@example.com\nBob,bob@example.com\n,x@y.z');

  await expect(page.locator('#bulk-preview table')).toHaveCount(1);
  await expect(page.locator('#bulk-preview tbody tr')).toHaveCount(4);
  const text = await page.locator('#bulk-preview').innerText();
  expect(text).toContain('ada-ada.html');
  expect(text).toMatch(/Duplicate row/i);
  expect(text).toMatch(/No name/i);
  await expectNoErrors(h);
});

test('import lets you reject individual fields', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');           /* existing title must survive */
  const before = await page.evaluate(() => ({ title: state.profile.title, name: state.profile.name }));

  await page.click('#btn-import');
  await page.fill('#import-src', `<table><tr><td><b>Imported Name</b><br>Imported Title<br>Acme<br>
    <a href="mailto:new@example.com">new@example.com</a></td></tr></table>`);
  await page.click('#import-parse');

  await expect(page.locator('#import-fields .import-chip').first()).toBeVisible();
  /* Reject the title, keep the name. */
  await page.uncheck('[data-import-field="profile.title"]');
  await page.click('#import-apply');
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({ title: state.profile.title, name: state.profile.name, email: state.contact.email }));
  expect(after.name).toBe('Imported Name');
  expect(after.title).toBe(before.title);
  expect(after.email).toBe('new@example.com');
  await expectNoErrors(h);
});
