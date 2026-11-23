/* Bowerbird Signature Builder — shared E2E helpers. */
'use strict';

const { expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:8137';

/* BENIGN CONSOLE NOISE (documented, not silently swallowed):
   The app renders its 10 template-thumbnail iframes with sandbox="" and
   static HTML (index.html: <iframe class="tthumb" sandbox="">). Playwright's
   test runner injects an instrumentation script into every frame; Chromium
   blocks that injection in sandboxed frames and logs this exact console
   error. It is an artifact of the harness, not the app — the app injects no
   scripts into those frames, and the message never appears in a real
   browser. Anything that does NOT match this pattern still fails. */
const SANDBOX_INSTRUMENTATION_NOISE =
  /^Blocked script execution in 'about:(blank|srcdoc)' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/;

/* CID image mode: the preview iframe legitimately tries to load cid: refs,
   which Chromium cannot resolve (they only resolve inside mail clients).
   The error is expected when the mode is on — the eml pipeline attaches
   the parts, not the browser. */
const CID_UNKNOWN_SCHEME_NOISE = /^Failed to load resource: net::ERR_UNKNOWN_URL_SCHEME$/;

/**
 * Boot the app into a clean, deterministic state and return a handle.
 *
 * The handle collects pageerror + console.error entries and exposes them
 * (expectNoErrors below asserts on them — zero errors expected by default;
 * any benign error must be documented in the spec that allowlists it).
 *
 * Sequence:
 *  1. First visit (cache-busted) — lets the app register its service worker.
 *  2. Wait for the SW to be active, then unregister it, wipe caches,
 *     localStorage and sessionStorage.
 *  3. Second visit with a fresh cache-buster — boots on clean storage, so the
 *     first-run wizard opens; skip it.
 */
async function freshPage(page) {
  const handle = {
    page,
    pageErrors: [],
    consoleErrors: [],
    wizardShown: false,
  };
  page.on('pageerror', err => handle.pageErrors.push(String((err && err.stack) || err)));
  page.on('console', msg => {
    if (msg.type() === 'error') handle.consoleErrors.push(msg.text());
  });

  await page.goto(`${BASE_URL}/?sw=purge&t=${Date.now()}`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    try {
      if ('serviceWorker' in navigator) {
        /* ready() never settles if no registration succeeds — bound the wait. */
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
  });

  /* Returning-user seed (BEFORE the app boots): every editor section open,
     so the essentials-first first-visit pass (which collapses most of them
     when the sections map is absent) never fires for existing specs. The
     pointer tour is marked taken for the same reason. Matches the real
     data-sec values in index.html. */
  await page.evaluate(() => {
    localStorage.setItem('sigstudio.sections', JSON.stringify({
      tpl: true,
      profile: true,
      logo: true,
      contact: true,
      socials: true,
      org: true,
      type: true,
      blocks: true,
      adv: true,
      elements: true,
    }));
    localStorage.setItem('sigstudio.tour.done', '1');
    localStorage.setItem('sigstudio.mode', 'advanced');
    });

  await page.goto(`${BASE_URL}/?t=${Date.now()}`, { waitUntil: 'load' });
  /* Draft images are hydrated from IndexedDB asynchronously. */
  await page.waitForFunction(() => window.__imagesReadyDone === true, null, { timeout: 5000 }).catch(() => {});

  /* The first-run wizard opens on fresh storage. Dismiss it. */
  handle.wizardShown = await page
    .locator('#modal-wizard')
    .evaluate(el => !el.classList.contains('hidden'));
  if (handle.wizardShown) await page.click('#wiz-skip');

  return handle;
}

/**
 * Assert zero page errors and zero console errors so far.
 * The only tolerated entries are Playwright-instrumentation noise from the
 * app's sandboxed thumbnail iframes — see SANDBOX_INSTRUMENTATION_NOISE.
 * Page errors (pageerror) always fail.
 */
function rawErrors(handle) {
  return [...handle.pageErrors, ...handle.consoleErrors];
}

async function expectNoErrors(handle) {
  const errors = rawErrors(handle)
    .filter(e => !SANDBOX_INSTRUMENTATION_NOISE.test(e))
    .filter(e => !CID_UNKNOWN_SCHEME_NOISE.test(e));
  expect(
    errors,
    'expected zero page/console errors (sandboxed-thumbnail instrumentation noise excluded):\n' +
      errors.map(e => `  - ${e}`).join('\n')
  ).toEqual([]);
}

/** Current srcdoc of the preview iframe ('' while unset). */
async function previewSrcdoc(page) {
  return (await page.locator('#preview-frame').getAttribute('srcdoc')) || '';
}

/* Sections and nested sub-groups: open them before interacting with
   controls inside (collapsed groups are display:none). */
async function openSection(page, sec) {
  const el = page.locator(`details[data-sec="${sec}"]`);
  if (!(await el.evaluate(d => d.open))) await el.locator('> summary').click();
}
async function openSub(page, i18nKey) {
  const el = page.locator(`details.sub:has(> summary[data-i18n="${i18nKey}"])`).first();
  if (!(await el.evaluate(d => d.open))) await el.locator('> summary').click();
}

module.exports = {
  BASE_URL,
  freshPage,
  openSection,
  openSub,
  expectNoErrors,
  rawErrors,
  SANDBOX_INSTRUMENTATION_NOISE,
  previewSrcdoc,
};
