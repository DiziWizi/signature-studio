/* v0.86: backup restore, team photo correctness, output contrast. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function makeBackup(page) {
  const b64 = await page.evaluate(async () => {
    const zip = zipStore(await backupFiles());
    let s = '';
    for (const byte of zip) s += String.fromCharCode(byte);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

async function restoreFile(page, buffer, name = 'backup.zip') {
  await page.setInputFiles('#restore-file', { name, mimeType: 'application/zip', buffer });
  await expect(page.locator('#modal-restore')).not.toHaveClass(/hidden/);
}

test('a backup round-trips draft and saved signatures', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-saved');
  await page.fill('#save-name', 'External');
  await page.click('#save-now');
  await page.fill('#save-name', 'Internal');
  await page.click('#save-now');
  await page.click('#saved-close');

  const backup = await makeBackup(page);
  await page.evaluate(() => {
    localStorage.removeItem('sigstudio.saved.v1');
    renderSavedList();
    updateSavedCount();
    state.profile.name = 'Changed afterwards';
    renderPreview();
  });
  expect(await page.locator('#saved-count').textContent()).toBe('0');

  await restoreFile(page, backup);
  await expect(page.locator('#restore-summary')).toContainText('2');
  await page.click('#restore-merge');
  await expect(page.locator('#modal-restore')).toHaveClass(/hidden/);
  await expect(page.locator('#saved-count')).toHaveText('2');
  expect(await page.evaluate(() => state.profile.name)).toBe('Ada Lovelace');
  await expectNoErrors(h);
});

test('replace clears existing snapshots; merge keeps them', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.click('#btn-saved');
  await page.fill('#save-name', 'From backup');
  await page.click('#save-now');
  await page.click('#saved-close');
  const backup = await makeBackup(page);

  await page.click('#btn-saved');
  await page.fill('#save-name', 'Existing only');
  await page.click('#save-now');
  await page.click('#saved-close');
  await expect(page.locator('#saved-count')).toHaveText('2');

  await restoreFile(page, backup);
  await page.click('#restore-replace');
  await expect(page.locator('#saved-count')).toHaveText('1');

  await restoreFile(page, backup);
  await page.click('#restore-merge');
  await expect(page.locator('#saved-count')).toHaveText('2');
  await expectNoErrors(h);
});

test('a corrupt ZIP is refused with a clear message', async ({ page }) => {
  const h = await freshPage(page);
  await page.setInputFiles('#restore-file', {
    name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all'),
  });
  await expect(page.locator('#toasts')).toContainText(/could not be read/i);
  await expect(page.locator('#modal-restore')).toHaveClass(/hidden/);
  await expectNoErrors(h);
});

test('team contact cards carry per-person photos, never the base headshot', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(p => { state.design.portraitUrl = p; }, PNG_1PX);
  await page.evaluate(() => openBulk());
  await page.fill('#bulk-csv', [
    'name,email,title,photo',
    'Ada Lovelace,ada@example.com,Analyst,https://example.com/ada.jpg',
    'Grace Hopper,grace@example.com,Admiral,https://example.com/grace.jpg',
  ].join('\n'));

  const cards = await page.evaluate(() => contactCardFiles(''));
  expect(cards[0].data).toContain('https://example.com/ada.jpg');
  expect(cards[1].data).toContain('https://example.com/grace.jpg');
  expect(cards[0].data).not.toContain('ENCODING=b');

  const rows = await page.evaluate(() => {
    const plan = bulkPlan(state, document.querySelector('#bulk-csv').value);
    return plan.rows.map(r => r.state.design.portraitUrl);
  });
  expect(rows).toEqual(['https://example.com/ada.jpg', 'https://example.com/grace.jpg']);

  /* Without a photo column the personal portrait must not be copied onto
     everyone's card. */
  await page.fill('#bulk-csv', 'name,email\nAda Lovelace,ada@example.com\nGrace Hopper,grace@example.com');
  const plain = await page.evaluate(() => contactCardFiles(''));
  expect(plain[0].data).not.toContain('PHOTO');
  await expectNoErrors(h);
});

test('the compatibility scan grades output contrast', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const fail = await page.evaluate(() => {
    state.design.textColor = '#dddddd';
    return compatIssues(state).filter(i => i.key.startsWith('compat.contrast')).map(i => i.key);
  });
  expect(fail).toContain('compat.contrastTextFail');

  const warn = await page.evaluate(() => {
    state.design.textColor = '#777777';
    state.design.linkColor = '#eeeeee';
    return compatIssues(state).filter(i => i.key.startsWith('compat.contrast')).map(i => i.key);
  });
  expect(warn).toEqual(expect.arrayContaining(['compat.contrastTextWarn', 'compat.contrastLink']));
  await expectNoErrors(h);
});
