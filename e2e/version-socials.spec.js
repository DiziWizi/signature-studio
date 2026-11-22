const { test, expect } = require('@playwright/test');
const { freshPage, previewSrcdoc, expectNoErrors } = require('./helper');

test('socials position: underName renders above contact on every template', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Sample draft: Ada Lovelace with LinkedIn + X chips. */
  await page.click('[data-field="design.socialsPosition"][value="underName"]');
  await page.click('[data-template="enterprise"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('Ada Lovelace');

  let doc = await previewSrcdoc(page);
  const socialsIdx = doc.indexOf('linkedin.com');
  const contactIdx = doc.indexOf('ada@example.com');
  expect(socialsIdx).toBeGreaterThan(-1);
  expect(contactIdx).toBeGreaterThan(-1);
  expect(socialsIdx).toBeLessThan(contactIdx);

  /* The reported bug: enterprise used to emit socials after the footer —
     under the name they must precede the contact details. */
  expect(doc.indexOf('soc-name')).toBeLessThan(doc.indexOf('ada@example.com'));

  /* Same guarantee on the other late-emission templates. */
  for (const tmpl of ['night', 'letterhead', 'roundel', 'masthead', 'monogram',
                      'photocard', 'postcard', 'quote', 'duotone']) {
    await page.click(`[data-template="${tmpl}"]`);
    await expect.poll(() => previewSrcdoc(page)).toContain('linkedin.com');
    doc = await previewSrcdoc(page);
    const sIdx = doc.indexOf('linkedin.com');
    const cIdx = doc.indexOf('ada@example.com');

    expect(sIdx).toBeGreaterThan(-1);
    if (cIdx > -1) expect(sIdx).toBeLessThan(cIdx);
  }

  /* Line is one row by design — underName puts the chips on their own
     line beneath the whole line (the contact bits share that row). */
  await page.click('[data-template="line"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('linkedin.com');
  doc = await previewSrcdoc(page);
  expect(doc.indexOf('linkedin.com')).toBeGreaterThan(doc.indexOf('Ada Lovelace'));

  /* bottom restores the original order (contact first). */
  await page.click('[data-template="enterprise"]');
  await page.click('[data-field="design.socialsPosition"][value="bottom"]');
  await expect.poll(() => previewSrcdoc(page)).toContain('ada@example.com');
  doc = await previewSrcdoc(page);
  expect(doc.indexOf('ada@example.com')).toBeLessThan(doc.indexOf('linkedin.com'));

  await expectNoErrors(h);
});

test('footer images get upload buttons and per-image CID controls', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  /* Brand footer upload buttons exist and accept files. */
  expect(await page.locator('#upload-footer-left').count()).toBe(1);
  expect(await page.locator('#upload-footer-center').count()).toBe(1);
  expect(await page.locator('#upload-footer-right').count()).toBe(1);

  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.fill('[data-field="design.footerLeftImg"]', TINY_PNG);
  await page.selectOption('[data-field="design.imageRef.footerLeft"]', 'cid');
  await page.click('[data-template="enterprise"]');

  await expect.poll(() => previewSrcdoc(page)).toContain('src="cid:sigstudio-footer-left"');
  const doc = await previewSrcdoc(page);
  expect(doc).not.toContain('data:image/png;base64,iVBORw0KGgo');

  /* Only the left footer image is CID; the logo stays as entered. */
  const logoTiny = doc.indexOf('src="cid:sigstudio-logo"');
  expect(logoTiny).toBe(-1);

  await expectNoErrors(h);
});

test('no template renders the social row twice at any position', async ({ page }) => {
  const h = await freshPage(page);
  await page.click('#btn-sample');

  const bad = await page.evaluate(() => {
    const color = networkById(state.socials[0].network).color;
    const needle = `background-color:${color}`;
    const failures = [];
    state.design.socialStyle = 'icons';
    for (const pos of ['bottom', 'underName', 'inContact']) {
      state.design.socialsPosition = pos;
      for (const def of TEMPLATES) {
        state.design.template = def.id;
        const html = renderSignature(state);
        const count = html.split(needle).length - 1;
        /* Reply deliberately omits socials — it is a one-line layout. */
        const expected = def.id === 'reply' ? 0 : 1;
        if (count !== expected) failures.push({ pos, template: def.id, count, expected });
      }
    }
    return failures;
  });
  expect(bad).toEqual([]);
  await expectNoErrors(h);
});

test('app footer shows the software version matching package.json', async ({ page }) => {
  const h = await freshPage(page);
  const pkg = require('../package.json');
  await expect(page.locator('#app-version')).toHaveText(new RegExp(`^Signature Studio v${pkg.version.replace(/\./g, '\\.')}$`));
  await expectNoErrors(h);
});
