/* v0.44 welcome pass: essentials-first sections, empty-state preview guide,
   live trust badge and the one-shot pointer tour. These specs deliberately
   bypass freshPage — that helper seeds a returning user (all sections open,
   tour taken) so the 117 legacy specs never see first-visit behaviour. */
'use strict';

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helper');

/* Boot once, wipe every trace (SW, caches, storage), optionally seed a few
   keys, then boot again. The second boot is a genuine first visit: the
   sections map is absent, so the app applies its essentials-first pass. */
async function wipeStorage(page, seed = {}) {
  await page.evaluate(async (seed) => {
    try {
      if ('serviceWorker' in navigator) {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(resolve => setTimeout(resolve, 2000)),
        ]);
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) { /* ignore */ }
    if (window.caches) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) { /* ignore */ }
    }
    localStorage.clear();
    sessionStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
}

async function firstVisitBoot(page, seed = {}) {
  await page.goto(`${BASE_URL}/?t=${Date.now()}`, { waitUntil: 'load' });
  await wipeStorage(page, seed);
  await page.goto(`${BASE_URL}/?t=${Date.now() + 1}`, { waitUntil: 'load' });
}

/* A single boot on the fresh per-test context: storage is empty and — just
   as important — no intermediate navigation has flushed an autosave draft,
   which is the state the pointer tour requires. */
async function singleBoot(page) {
  await page.goto(`${BASE_URL}/?t=${Date.now()}`, { waitUntil: 'load' });
}

test('a reload that flushes an empty default draft still gets the tour', async ({ page }) => {
  /* First load, then reload: the unload flush writes a bare default draft,
     which must NOT count as a returning user. */
  await page.goto(`${BASE_URL}/?t=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  await page.goto(`${BASE_URL}/?t=${Date.now() + 1}`, { waitUntil: 'load' });

  await expect(page.locator('#modal-wizard')).not.toHaveClass(/hidden/);
  await page.click('#wiz-skip');
  await expect(page.locator('#tour-overlay')).not.toHaveClass(/hidden/);
  await expect(page.locator('#tour-text')).toContainText('builds here');
  await page.keyboard.press('Escape');
  await expect(page.locator('#tour-overlay')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => localStorage.getItem('sigstudio.tour.done'))).toBe('1');
});

test('essentials-first: a genuine first visit opens only Template and Identity', async ({ page }) => {
  await firstVisitBoot(page);
  const open = sel =>
    page.locator(`details[data-sec="${sel}"]`).evaluate(el => el.open);
  expect(await open('tpl')).toBe(true);
  expect(await open('profile')).toBe(true);
  for (const sec of ['logo', 'contact', 'socials', 'org', 'type', 'blocks', 'adv', 'elements']) {
    expect(await open(sec), `${sec} should start closed on a first visit`).toBe(false);
  }
  /* Nothing persisted: the map is only written when the user toggles. */
  expect(await page.evaluate(() => localStorage.getItem('sigstudio.sections'))).toBeNull();
});

test('empty-state guide: shown without a name, CTA opens Profile and focuses the name field', async ({ page }) => {
  await firstVisitBoot(page, { 'sigstudio.wizard.done': '1', 'sigstudio.tour.done': '1' });
  const guide = page.locator('#empty-guide');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Type your name to see your signature');
  await expect(guide.locator('#empty-guide-btn')).toContainText('Start with your name');

  await page.click('#empty-guide-btn');
  await expect(page.locator('[data-field="profile.name"]')).toBeFocused();

  /* A name in either field hides the guide the moment it exists. */
  await page.fill('[data-field="profile.name"]', 'Ada Lovelace');
  await expect(guide).toHaveClass(/hidden/);
  await page.fill('[data-field="profile.name"]', '');
  await expect(guide).toBeVisible();
  await page.fill('[data-field="profile.displayName"]', 'Ada');
  await expect(guide).toHaveClass(/hidden/);
});

test('trust badge: amber with a count while issues exist, green once resolved', async ({ page }) => {
  await firstVisitBoot(page, {
    'sigstudio.wizard.done': '1',
    'sigstudio.tour.done': '1',
    'sigstudio.sections': JSON.stringify({
      profile: true, contact: true, org: true, socials: true,
      customs: true, design: true, elements: true,
    }),
  });
  const badge = page.locator('#trust-badge');
  /* Empty editor → missing name + missing email. */
  await expect(badge).toHaveClass(/warn/);
  await expect(badge).toContainText('things to fix');

  /* The badge jumps to the checklist. */
  await badge.click();
  await expect(page.locator('#checklist')).toBeFocused();

  /* Fixing the two warns flips it to green. */
  await page.fill('[data-field="profile.name"]', 'Ada Lovelace');
  await page.fill('[data-field="contact.email"]', 'ada@example.com');
  await expect(badge).toHaveClass(/ok/);
  await expect(badge).toHaveText('Outlook-safe');
});

test('pointer tour: plays after the wizard is skipped, walks 4 highlighted steps, marks done on finish', async ({ page }) => {
  await singleBoot(page);
  await expect(page.locator('#modal-wizard')).not.toHaveClass(/hidden/);
  await page.click('#wiz-skip');

  const overlay = page.locator('#tour-overlay');
  await expect(overlay).not.toHaveClass(/hidden/);
  await expect(overlay).toHaveAttribute('role', 'dialog');
  await expect(overlay).toHaveAttribute('aria-label', 'Quick tour');

  const step = async (n, text, targetSel) => {
    await expect(overlay).toHaveAttribute('data-step', String(n));
    await expect(page.locator('#tour-text')).toHaveText(text);
    await expect(page.locator('#tour-next')).toBeFocused();
    /* The spotlight hole hugs the highlighted element (6px padding, plus a
       settling 180ms transition — poll until aligned). */
    await expect.poll(async () => {
      const spot = await page.locator('#tour-spot').boundingBox();
      const target = await page.locator(targetSel).boundingBox();
      if (!spot || !target) return false;
      return Math.abs(spot.x - target.x) <= 8 &&
        Math.abs(spot.y - target.y) <= 8 &&
        Math.abs(spot.width - target.width) <= 13 &&
        Math.abs(spot.height - target.height) <= 13;
    }, { timeout: 3000 }).toBe(true);
    if (n < 4) await page.click('#tour-next');
  };

  await step(1, 'Your signature builds here as you type', '#stage');
  await step(2, 'Start with your name', '[data-field="profile.name"]');
  await step(3, 'When it looks right: Export > Copy to clipboard', '#btn-export');
  await step(4, 'This list tells you if anything is missing', '#checklist');

  /* The final Next finishes the tour: done flag set, overlay gone, and
     focus returns to where the user was (the Guide button, after the
     wizard handed focus back). */
  await page.click('#tour-next');
  await expect(overlay).toHaveClass(/hidden/);
  expect(await page.evaluate(() => localStorage.getItem('sigstudio.tour.done'))).toBe('1');
  await expect(page.locator('#btn-guide')).toBeFocused();
});

test('pointer tour: Skip closes it and marks it done', async ({ page }) => {
  await singleBoot(page);
  await page.click('#wiz-skip');
  const overlay = page.locator('#tour-overlay');
  await expect(overlay).not.toHaveClass(/hidden/);
  await page.click('#tour-skip');
  await expect(overlay).toHaveClass(/hidden/);
  expect(await page.evaluate(() => localStorage.getItem('sigstudio.tour.done'))).toBe('1');
});

test('pointer tour: Escape closes it and marks it done', async ({ page }) => {
  await singleBoot(page);
  await page.click('#wiz-skip');
  const overlay = page.locator('#tour-overlay');
  await expect(overlay).not.toHaveClass(/hidden/);
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveClass(/hidden/);
  expect(await page.evaluate(() => localStorage.getItem('sigstudio.tour.done'))).toBe('1');
});
