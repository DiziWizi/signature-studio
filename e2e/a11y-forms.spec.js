/* v0.73: form semantics — autofill tokens, inline errors, live regions,
   heading navigation. */
'use strict';
const { test, expect } = require('@playwright/test');
const { freshPage, expectNoErrors } = require('./helper');

test('identity and contact fields carry autofill tokens and correct types', async ({ page }) => {
  const h = await freshPage(page);
  const attrs = await page.evaluate(() => {
    const get = f => {
      const el = document.querySelector(`[data-field="${f}"]`);
      return el ? { type: el.type, ac: el.getAttribute('autocomplete'), im: el.getAttribute('inputmode') } : null;
    };
    return {
      name: get('profile.name'), title: get('profile.title'), company: get('profile.company'),
      email: get('contact.email'), phone: get('contact.phone'), mobile: get('contact.mobile'),
      website: get('contact.website'), address: get('contact.address'),
    };
  });
  expect(attrs.name.ac).toBe('name');
  expect(attrs.title.ac).toBe('organization-title');
  expect(attrs.company.ac).toBe('organization');
  expect(attrs.email.ac).toBe('email');
  expect(attrs.email.type).toBe('email');
  expect(attrs.phone.ac).toBe('tel');
  expect(attrs.phone.type).toBe('tel');
  expect(attrs.mobile.type).toBe('tel');
  expect(attrs.website.type).toBe('url');
  expect(attrs.website.im).toBe('url');
  expect(attrs.address.ac).toBe('street-address');
  await expectNoErrors(h);
});

test('invalid email shows an inline message wired by aria-describedby', async ({ page }) => {
  const h = await freshPage(page);
  await page.fill('[data-field="contact.email"]', 'not-an-email');
  const email = page.locator('[data-field="contact.email"]');

  await expect(email).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await email.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator('#' + describedBy)).toHaveText(/incomplete/i);

  /* Fixing the value clears both the message and the ARIA state. */
  await page.fill('[data-field="contact.email"]', 'ada@example.com');
  await expect(email).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#' + describedBy)).toHaveCount(0);
  await expectNoErrors(h);
});

test('phone and website get their own inline hints', async ({ page }) => {
  const h = await freshPage(page);
  await page.fill('[data-field="contact.phone"]', 'abc');
  await expect(page.locator('[data-field="contact.phone"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#err-contact-phone')).toContainText(/short/i);

  await page.fill('[data-field="contact.website"]', 'javascript:alert(1)');
  await expect(page.locator('[data-field="contact.website"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#err-contact-website')).toContainText(/web address/i);
  await expectNoErrors(h);
});

test('the checklist state is announced without reading every row', async ({ page }) => {
  const h = await freshPage(page);
  const live = page.locator('#check-announce');
  await expect(live).toHaveAttribute('role', 'status');
  await expect(live).toHaveAttribute('aria-live', 'polite');

  await page.click('#btn-sample');
  await expect(live).toHaveText(/Ready to export/i);
  await page.fill('[data-field="contact.email"]', 'broken');
  await expect(live).toHaveText(/\d+ item\(s\) to review/i);
  await expectNoErrors(h);
});

test('the ten sections expose heading navigation', async ({ page }) => {
  const h = await freshPage(page);
  const structure = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    h1Text: (document.querySelector('h1') || {}).textContent,
    sectionHeadings: [...document.querySelectorAll('details[data-sec] > summary [role="heading"]')]
      .map(e => ({ level: e.getAttribute('aria-level'), text: (e.textContent || '').trim().slice(0, 22) })),
  }));
  expect(structure.h1).toBe(1);
  expect(structure.h1Text.trim()).toBe('Signature Studio');
  expect(structure.sectionHeadings).toHaveLength(10);
  expect(structure.sectionHeadings.every(x => x.level === '2')).toBe(true);
  expect(structure.sectionHeadings.map(x => x.text)).toContain('Profile');
  await expectNoErrors(h);
});

test('axe still reports no serious or critical violations with the new semantics', async ({ page }) => {
  const AxeBuilder = require('@axe-core/playwright').default;
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.fill('[data-field="contact.email"]', 'broken');
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#preview-frame')
    .exclude('.thumb iframe')
    .analyze();
  const bad = res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id} (${v.impact})`);
  expect(bad).toEqual([]);
  await expectNoErrors(h);
});
