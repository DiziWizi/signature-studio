/* v0.33: CSV bulk generation -> ZIP of signature files. */
'use strict';

const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const CSV = `name,email,title,company,phone
Ada Lovelace,ada@example.com,Head of Analytics,Analytical Engines Ltd,+44 20 7946 0958
Maya Chen,maya@example.com,Designer,Freelance,,
No Email Person,,Intern,Somewhere,`;

test('bulk generate builds a ZIP with one file per valid row', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-export');
  await page.click('#x-bulk');
  await expect(page.locator('#modal-bulk')).not.toHaveClass(/hidden/);

  await page.fill('#bulk-csv', CSV);
  const dlPromise = page.waitForEvent('download');
  await page.click('#bulk-generate');
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('ada-lovelace-analytical-engines-signatures.zip');
  await expect(page.locator('#bulk-result')).toHaveText('2 generated, 1 skipped.');

  /* Unzip enough to verify: PK magic, both file names, contents. */
  const buf = require('fs').readFileSync(await dl.path());
  expect(buf.slice(0, 2).toString('latin1')).toBe('PK');
  const blob = buf.toString('latin1');
  /* v0.69: filenames carry the email local part so two people with the
     same name cannot collide inside the ZIP. */
  expect(blob).toContain('ada-lovelace-ada.html');
  expect(blob).toContain('maya-chen-maya.html');
  expect(blob).toContain('Head of Analytics');
  expect(blob).toContain('Freelance');

  await expectNoErrors(h);
});

test('bulk generate with no email column reports it', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  await page.click('#btn-export');
  await page.click('#x-bulk');
  await page.fill('#bulk-csv', 'name,title\nAda Lovelace,Boss\n');
  await page.click('#bulk-generate');
  await expect(page.locator('#bulk-result')).toContainText('No email column');

  await expectNoErrors(h);
});
