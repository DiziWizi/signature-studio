/* v0.101: accessibility of the new surfaces + 1.0 documentation. */
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { freshPage, expectNoErrors } = require('./helper');

async function audit(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#preview-frame')
    .exclude('.thumb iframe')
    .analyze();
  return results.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id} (${v.impact})`);
}

test('picker, dark-logo field and proof dialog have no serious axe violations', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  await page.evaluate(() => {
    document.querySelector('details[data-sec="logo"]').open = true;
  });
  expect(await audit(page)).toEqual([]);

  await page.click('#btn-export');
  await page.click('#x-test');
  expect(await audit(page)).toEqual([]);
  await expectNoErrors(h);
});

test('the new controls expose names, state and descriptions', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');
  const a11y = await page.evaluate(() => {
    const search = document.querySelector('#tpl-search');
    const count = document.querySelector('#tpl-count');
    const empty = document.querySelector('#tpl-empty');
    const dark = document.querySelector('[data-field="design.logoDarkUrl"]');
    const modal = document.querySelector('#modal-test');
    const describedby = modal.getAttribute('aria-describedby');
    const lead = describedby ? document.getElementById(describedby) : null;
    return {
      searchName: search.getAttribute('aria-label'),
      countRole: count.getAttribute('role'),
      emptyRole: empty.getAttribute('role'),
      darkName: dark.getAttribute('aria-label'),
      describedby,
      leadText: lead ? lead.textContent.trim().length : 0,
    };
  });
  expect(a11y.searchName).toBeTruthy();
  expect(a11y.countRole).toBe('status');
  expect(a11y.emptyRole).toBe('status');
  expect(a11y.darkName).toBeTruthy();
  expect(a11y.describedby).toBe('test-lead');
  expect(a11y.leadText).toBeGreaterThan(40);

  /* Reduced motion is honoured in CSS. */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const durations = await page.evaluate(() => {
    const btn = document.querySelector('#btn-sample');
    return {
      transition: getComputedStyle(btn).transitionDuration,
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
  expect(durations.matches).toBe(true);
  expect(parseFloat(durations.transition)).toBeLessThanOrEqual(0.01);
  await expectNoErrors(h);
});

test('the changelog and README describe this release honestly', async () => {
  const root = path.resolve(__dirname, '..');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  expect(changelog).toContain('## 0.101.0');
  expect(changelog).toContain('## 0.99.0');
  expect(readme).toContain('25 layout templates');
  expect(readme).toContain('## Browser support');
  expect(readme).toContain('## What 1.0 means');
  expect(readme).toContain('text only');
  expect(readme).toContain('Outlook signature-folder ZIP');
});
