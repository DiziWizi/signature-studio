/* Signature Studio — UI wiring. */
'use strict';

/* ── state ────────────────────────────────────────────────────────────── */

let state = null;
let lastParsedImport = null;
let lastSaveAt = 0;
let dragCtx = null; // { type: 'socials'|'customs', index }
let waitingWorker = null; // SW waiting to activate (update pill)
let reloadOnControl = false; // reload once the promoted worker takes control

const HISTORY_MAX = 50;
let undoStack = [];
let redoStack = [];

const $ = sel => document.querySelector(sel);

/* Preview loads hosted images by default (visual parity with a mail client);
   turning it off keeps the app from pinging third-party hosts. */
function remoteImagesOn() {
  try { return localStorage.getItem('sigstudio.remoteImg') !== '0'; } catch (e) { return true; }
}

/* ── dangerous-markup stripping ─────────────────────────────────────────
   The preview iframe is same-origin (it must be: the height sync reads
   contentDocument), and the Custom HTML block is raw by design — so a
   pasted/imported/shared payload could script the app and read every saved
   signature. Strip the executable surface wherever state enters the app
   and again at the preview sink; the exported markup is still whatever the
   user wrote, minus dangerous URL schemes. */
const DANGEROUS_URL = /^\s*(?:javascript|vbscript|data:text\/html)/i;

function cleanDangerousNodes(root) {
  root.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv],link[rel="import"]')
    .forEach(n => n.remove());
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name) &&
          DANGEROUS_URL.test(attr.value)) { el.removeAttribute(attr.name); continue; }
      if (name === 'style' && /expression\s*\(|url\(\s*['"]?\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

function sanitiseHtmlFragment(html) {
  const src = String(html || '');
  if (!src.trim()) return src;
  const doc = new DOMParser().parseFromString(src, 'text/html');
  cleanDangerousNodes(doc.body);
  return doc.body.innerHTML;
}

function sanitiseDocumentHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  cleanDangerousNodes(doc);
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function normalizeLoadedState(raw) {
  const def = defaultState();
  const out = Object.assign({}, def, raw || {});
  /* Legacy v0.48 global imageMode: fold into per-image overrides. */
  if (out.design && out.design.imageMode === 'cid') {
    const ref = out.design.imageRef || (out.design.imageRef = {});
    for (const k of ['logo', 'banner', 'footerLeft', 'footerCenter', 'footerRight', 'socials']) {
      if (!ref[k]) ref[k] = 'cid';
    }
    delete out.design.imageMode;
  }
  out.profile = Object.assign({}, def.profile, (raw || {}).profile || {});
  out.contact = Object.assign({}, def.contact, (raw || {}).contact || {});
  out.design = Object.assign({}, def.design, (raw || {}).design || {});
  /* Legacy saves: pre-photoShape states used roundPhoto — migrate it so
     old round photos stay circular instead of silently becoming square. */
  if (!((raw || {}).design || {}).photoShape && out.design.roundPhoto) {
    out.design.photoShape = 'circle';
  }
  out.meta = Object.assign({}, def.meta, (raw || {}).meta || {});
  if (!Array.isArray(out.socials)) out.socials = [];
  if (!Array.isArray(out.customLines)) out.customLines = [];
  /* Coerce by the default's type: an imported file with an object where a
     string belongs used to render "[object Object]" in the signature. */
  const asStr = v => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : ''));
  for (const group of ['profile', 'contact']) {
    for (const k of Object.keys(def[group])) out[group][k] = asStr(out[group][k]);
  }
  for (const [k, dv] of Object.entries(def.design)) {
    const v = out.design[k];
    if (k === 'imageRef') continue;
    if (typeof dv === 'string') out.design[k] = asStr(v);
    else if (typeof dv === 'number') out.design[k] = Number.isFinite(Number(v)) ? Number(v) : dv;
    else if (typeof dv === 'boolean') out.design[k] = typeof v === 'boolean' ? v : dv;
  }
  out.design.direction = out.design.direction === 'rtl' ? 'rtl' : '';
  out.design.imageRef = Object.assign({}, def.design.imageRef || {}, out.design.imageRef || {});
  for (const k of Object.keys(def.design.imageRef || {})) {
    out.design.imageRef[k] = asStr(out.design.imageRef[k]);
  }
  /* Custom lines are { label, value } (plus an optional url on older
     saves) — coerce the two fields, never invent a new shape. */
  out.customLines = out.customLines
    .filter(l => l && typeof l === 'object')
    .map(l => Object.assign({}, l, { label: asStr(l.label), value: asStr(l.value) }))
    .filter(l => l.label || l.value);
  /* Never let executable markup in through a file, link or stale draft. */
  if (typeof out.design.customHtml === 'string' && out.design.customHtml) {
    out.design.customHtml = sanitiseHtmlFragment(out.design.customHtml);
  }
  out.socials = out.socials.filter(s => s && typeof s === 'object').map(s => {
    const url = typeof s.url === 'string' ? s.url : '';
    return DANGEROUS_URL.test(url) ? Object.assign({}, s, { url: '' }) : s;
  });
  return out;
}

/* ── history (undo/redo) ──────────────────────────────────────────────── */

/* History entries carry what they will undo: an unlabelled ↶ is something
   people don't trust, especially before a destructive-looking reset. */
/* History keeps refs, not image bytes: a 50-entry stack of deep clones with
   multi-megabyte data URLs was the largest memory consumer in the editor.
   Entries are hydrated on undo/redo, and a character budget bounds the rare
   uncached data URL. */
const HISTORY_BYTE_BUDGET = 6 * 1024 * 1024;

function historyImageChars(stateObj) {
  let chars = 0;
  if (typeof imageSlots === 'function') {
    for (const { obj, key } of imageSlots(stateObj)) chars += String(obj[key] || '').length;
  }
  return chars;
}

function trimHistoryBudget() {
  let total = undoStack.reduce((sum, entry) => sum + (entry.size || 0), 0);
  while (undoStack.length > 1 && total > HISTORY_BYTE_BUDGET) {
    total -= undoStack.shift().size || 0;
  }
}

function pushHistory(key = 'undo.edit', params = null) {
  const snapshot = typeof refsForStorage === 'function' ? refsForStorage(state) : clone(state);
  undoStack.push({ state: snapshot, key, params, size: 40000 + historyImageChars(snapshot) });
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  trimHistoryBudget();
  redoStack = [];
  updateUndoButtons();
}

function historyImageIds() {
  const ids = new Set();
  if (typeof imageSlots !== 'function') return ids;
  for (const entry of [...undoStack, ...redoStack]) {
    for (const { obj, key } of imageSlots(entry.state)) {
      const value = String(obj[key] || '');
      if (value.startsWith('idb:')) ids.add(value.slice(4));
    }
  }
  return ids;
}

function undoWhat(entry) {
  return entry ? t(entry.key || 'undo.edit', entry.params || {}) : '';
}

async function doUndo() {
  if (!undoStack.length) return;
  const entry = undoStack.pop();
  redoStack.push({
    state: typeof refsForStorage === 'function' ? refsForStorage(state) : clone(state),
    key: entry.key,
    params: entry.params,
  });
  const restored = entry.state;
  try {
    if (typeof unpackImages === 'function') await unpackImages(restored);
  } catch (e) { /* refs that no longer exist blank their slot */ }
  state = restored;
  rebuildAll();
  scheduleSave();
  updateUndoButtons();
  showToast(t('toast.undoneWhat', { what: undoWhat(entry) }), '', { key: 'toast.undone' });
}

async function doRedo() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  const snapshot = typeof refsForStorage === 'function' ? refsForStorage(state) : clone(state);
  undoStack.push({ state: snapshot, key: entry.key, params: entry.params, size: 40000 + historyImageChars(snapshot) });
  trimHistoryBudget();
  const restored = entry.state;
  try {
    if (typeof unpackImages === 'function') await unpackImages(restored);
  } catch (e) { /* ignore */ }
  state = restored;
  rebuildAll();
  scheduleSave();
  updateUndoButtons();
  showToast(t('toast.redoneWhat', { what: undoWhat(entry) }), '', { key: 'toast.redone' });
}

function updateUndoButtons() {
  const u = $('#btn-undo');
  const r = $('#btn-redo');
  const top = undoStack[undoStack.length - 1];
  const back = redoStack[redoStack.length - 1];
  if (u) {
    u.disabled = !top;
    const label = top ? t('undo.label', { what: undoWhat(top) }) : '';
    u.title = label;
    u.setAttribute('aria-label', label || t('topbar.undoAria'));
  }
  if (r) {
    r.disabled = !back;
    const label = back ? t('undo.redoLabel', { what: undoWhat(back) }) : '';
    r.title = label;
    r.setAttribute('aria-label', label || t('topbar.redoAria'));
  }
}

/* ── preview ──────────────────────────────────────────────────────────── */

/* Coalesced preview: at most one render per animation frame. Typing bursts
   in a single frame collapse to one srcdoc swap instead of N, and the
   thumbnail pass below is throttled further. rAF simply does not fire in
   background tabs (no input happens there either), so reliability keeps. */
let previewQueued = false;
function renderPreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    renderPreviewNow();
  });
}

/* Conditional visibility: hide controls whose feature is off, whose
   data they need is empty, or whose subject doesn't exist yet. Rules ride
   on data-when (space-separated = ALL must be on) and data-when-fill
   (field must be non-empty). Special subjects: @socials, @pronouns,
   @status. */
/* ── settings search ──────────────────────────────────────────────────── */

let settingsFilterActive = false;

function applySettingsFilter() {
  const input = $('#settings-search');
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  const empty = $('#settings-search-empty');
  const wasActive = settingsFilterActive;
  settingsFilterActive = q.length > 0;

  if (!settingsFilterActive) {
    document.querySelectorAll('.filtered-out').forEach(el => el.classList.remove('filtered-out'));
    document.querySelectorAll('details[data-sec]').forEach(s => s.classList.remove('hidden'));
    if (empty) empty.classList.add('hidden');
    if (wasActive) applyFieldVisibility();
    return;
  }

  /* Searching reveals everything a feature toggle would hide — a match
     must never be a phantom result. */
  document.querySelectorAll('#main [data-when].hidden, #main [data-when-fill].hidden')
    .forEach(el => el.classList.remove('hidden'));

  let total = 0;
  document.querySelectorAll('details[data-sec]').forEach(sec => {
    const sumEl = sec.querySelector(':scope > summary');
    const sumMatch = (sumEl ? sumEl.textContent : '').toLowerCase().includes(q);
    let hits = 0;
    const controls = sec.querySelectorAll('.body .field, .body label.switch, .body .range-row, .body .tpl-btn, .body .hint, .body .quick, .body .themes-row');
    controls.forEach(c => {
      /* A control nested inside another control (a range row inside its
         field) is governed by its owner — otherwise the slider vanishes
         while its label row stays. */
      const owner = c.parentElement && c.parentElement.closest('.field, label.switch');
      if (owner && owner !== c) {
        c.classList.remove('filtered-out');
        return;
      }
      const sub = c.closest('details.sub');
      const subEl = sub ? sub.querySelector(':scope > summary') : null;
      const subMatch = subEl ? subEl.textContent.toLowerCase().includes(q) : false;
      const own = (c.textContent || '').toLowerCase().includes(q);
      const show = sumMatch || subMatch || own;
      c.classList.toggle('filtered-out', !show);
      if (show) hits++;
    });
    sec.querySelectorAll('details.sub').forEach(sub => {
      const subEl = sub.querySelector(':scope > summary');
      const sM = subEl ? subEl.textContent.toLowerCase().includes(q) : false;
      const hasHit = [...sub.querySelectorAll('.field, label.switch')].some(x => !x.classList.contains('filtered-out'));
      const keep = sumMatch || sM || hasHit;
      sub.classList.toggle('filtered-out', !keep);
      if (keep) sub.open = true;
    });
    const showSec = sumMatch || hits > 0;
    sec.classList.toggle('hidden', !showSec);
    if (showSec) { sec.open = true; total += Math.max(hits, 1); }
  });
  if (empty) empty.classList.toggle('hidden', total > 0);
}

/* Preview → settings: clicking an annotated element scrolls to and
   flashes the control that produces it. */
const EDIT_TARGETS = {
  name: 'profile.name', pronouns: 'profile.pronouns', title: 'profile.title',
  company: 'profile.company', tagline: 'profile.tagline', location: 'profile.location',
  status: 'design.statusText', legal: 'design.legalText', qr: 'design.showQr',
  divider: 'design.dividerStyle', logo: 'design.logoUrl', banner: 'design.bannerUrl',
};

/* Shared jump-to-setting: accepts a data-field path or '@section:<id>'.
   Opens the section (and any nested sub-group), scrolls to the control and
   flashes it. Hidden controls fall back to the section header. */
function focusField(pathOrSection) {
  if (!pathOrSection) return;
  let el = null;
  let sec = null;
  if (pathOrSection.startsWith('@section:')) {
    sec = document.querySelector(`details[data-sec="${pathOrSection.slice(9)}"]`);
  } else {
    el = document.querySelector(`[data-field="${pathOrSection}"]`);
    sec = el ? el.closest('details[data-sec]') : null;
  }
  if (!sec) return;
  if (!sec.open) sec.open = true;
  const sub = el ? el.closest('details.sub') : null;
  if (sub && !sub.open) sub.open = true;
  const visibleEl = el && el.offsetParent !== null ? el : null;
  const target = visibleEl
    ? (visibleEl.closest('.field, label.switch') || visibleEl)
    : (sec.querySelector(':scope > summary') || sec);
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('flash');
  void target.offsetWidth; /* restart the animation */
  target.classList.add('flash');
  setTimeout(() => target.classList.remove('flash'), 1700);
}

function revealControl(key) {
  if (!key) return;
  if (key.startsWith('contact:')) return focusField('contact.' + key.slice(8));
  if (key === 'socials') return focusField('@section:socials');
  if (key === 'footer') return focusField('@section:org');
  if (EDIT_TARGETS[key]) return focusField(EDIT_TARGETS[key]);
}

function visOn(v) {
  return !(v === false || v === '' || v === null || v === undefined);
}
function applyFieldVisibility() {
  if (!state) return;
  if (settingsFilterActive) return; /* search reveals everything */
  const hasSocials = (state.socials || []).some(x => String(x.url || '').trim());
  const specials = {
    '@socials': hasSocials,
    '@pronouns': String(state.profile.pronouns || '').trim() !== '',
    '@status': String(state.design.statusText || '').trim() !== '',
  };
  for (const el of document.querySelectorAll('[data-when]')) {
    const keys = el.dataset.when.split(/\s+/).filter(Boolean);
    const show = keys.every(k => (k in specials) ? specials[k] : visOn(getPath(state, k)));
    el.classList.toggle('hidden', !show);
  }
  for (const el of document.querySelectorAll('[data-when-fill]')) {
    const v = getPath(state, el.dataset.whenFill);
    el.classList.toggle('hidden', String(v || '').trim() === '');
  }
  /* Inline visibility eyes: the field stays editable but dims when its
     item is switched out of the signature. */
  for (const btn of document.querySelectorAll('[data-eye]')) {
    const on = getPath(state, btn.dataset.eye) !== false;
    btn.classList.toggle('eye-off', !on);
    btn.setAttribute('aria-pressed', String(on));
    const field = btn.closest('.field, label.switch');
    if (field) field.classList.toggle('vis-off', !on);
  }
}

/* Template-aware dimming: controls that only affect some layouts are
   dimmed (never hidden) with a "Only in …" chip when the current
   template doesn't use them. */
const TEMPLATE_LABEL_KEY = {
  classic: 'tpl.classic', centered: 'tpl.centered', compact: 'tpl.compact',
  banner: 'tpl.banner', minimal: 'tpl.minimal', split: 'tpl.split',
  roundel: 'tpl.roundel', masthead: 'tpl.masthead', monogram: 'tpl.monogram',
  photocard: 'tpl.photocard', postcard: 'tpl.postcard', line: 'tpl.line',
  duotone: 'tpl.duotone', quote: 'tpl.quote', enterprise: 'tpl.enterprise',
  night: 'tpl.night', letterhead: 'tpl.letterhead', custom: 'tpl.custom',
};
function applyTemplateDimming() {
  if (!state) return;
  const current = (state.design && state.design.template) || 'classic';
  for (const el of document.querySelectorAll('[data-used-by]')) {
    const list = el.dataset.usedBy.split(',').map(x => x.trim()).filter(Boolean);
    const used = list.includes(current);
    el.classList.toggle('tpl-dim', !used);
    if (!used) {
      const names = list.map(id => (TEMPLATE_LABEL_KEY[id] ? t(TEMPLATE_LABEL_KEY[id]) : id)).join(', ');
      el.dataset.dimLabel = t('dim.usedBy', { names });
    } else {
      delete el.dataset.dimLabel;
    }
  }
}

/* Per-section reset: design settings only — never content fields. */
const SECTION_RESET_KEYS = {
  tpl: ['signatureWidth', 'density', 'showCard', 'cardPadding', 'cardBorderWidth', 'strictOutlook', 'stackMobile'],
  logo: ['logoWidth', 'logoPosition', 'photoShape', 'useMonogram', 'imageRef.logo'],
  socials: ['socialStyle', 'socialSize', 'socialGap', 'socialsPosition', 'imageRef.socials'],
  type: ['primaryColor', 'textColor', 'dividerColor', 'linkColor', 'nameColor', 'mutedColor',
         'cardColor', 'background', 'darkModeFriendly', 'font', 'customFont', 'fontSize',
         'nameSizeExtra', 'nameWeight', 'taglineWeight', 'nameSpacing', 'density',
         'rowGap', 'cellPad', 'lineHeight', 'textAlign', 'showDivider', 'dividerStyle',
         'dividerLength', 'dividerPosition'],
  blocks: ['showQr', 'qrSize', 'showLegal', 'showStatus'],
  elements: ['showTitle', 'showCompany', 'showDepartment', 'showLocation', 'showEmail',
             'showPhone', 'showMobile', 'showWebsite', 'showAddress', 'showBooking',
             'showStatus', 'showSocials', 'showLabels'],
};
function resetSection(sec) {
  const keys = SECTION_RESET_KEYS[sec];
  if (!keys) return;
  pushHistory('undo.reset', { sec: t('sec.' + sec) });
  const def = defaultState();
  for (const k of keys) {
    const defVal = k.startsWith('imageRef.')
      ? def.design.imageRef[k.split('.')[1]]
      : def.design[k];
    setPath(state, 'design.' + k, defVal);
  }
  rebuildAll();
  scheduleSave();
  showToast(t('reset.done'), '', { key: 'reset.done' });
}

function renderPreviewNow() {
  const frame = $('#preview-frame');
  /* Annotated render (data-edit) + click reporter: clicks never navigate,
     they tell the editor which control produced the clicked element. */
  const previewScript =
    '<style>[data-edit]{cursor:pointer}[data-edit]:hover{outline:1px dashed rgba(91,124,250,.75);outline-offset:2px}</style>' +
    '<script src="assets/js/preview-reporter.js"></script>';
  let html = sanitiseDocumentHtml(renderSignaturePreview(state));
  /* Privacy/offline: a hosted logo pings its host on every keystroke. Let
     the user stop that without touching what the signature stores. */
  if (!remoteImagesOn()) {
    html = html.replace(/(<img\b[^>]*?)\ssrc="https?:\/\/[^"]*"/gi, '$1');
  }
  html = html.replace('</body>', previewScript + '</body>');
  frame.srcdoc = html;
  const peek = $('#peek-frame');
  if (peek && !$('#peek-sheet').classList.contains('hidden')) peek.srcdoc = html;
  applyFieldVisibility();
  const compactToggle = $('#variant-compact');
  if (compactToggle) compactToggle.checked = state.design.density === 'compact';
  applyTemplateDimming();
  applyFieldErrors();
  renderContrastMeter();
  renderContactOrder();
  renderThumbs();
  updateConciseness();
  updateChecklist();
  updateEmptyGuide();
}

/* Live template thumbnails: real renders of the current state per template,
   scaled down 0.13× in the picker. Embedded data: images are stripped so
   typing never re-decodes them across all thumbnails. Two gates on top:
   (a) the whole pass is skipped while the Design section is closed, and
   (b) when open it runs at most every 400ms with a trailing re-run — 17
   srcdoc parses per keystroke is the heaviest cost in the editor. */
let thumbsScheduled = false;
let thumbsNeedsRebuild = true;
function renderThumbs() {
  const sec = document.querySelector('details[data-sec="tpl"]');
  if (!sec || !sec.open) { thumbsNeedsRebuild = true; return; }
  /* Render on idle, at most once per quiet period: continuous typing never
     pays for 17 iframe parses; the tiles refresh when the user pauses (or
     at a 1.2s worst case). A hidden tab defers entirely. */
  if (thumbsScheduled) return;
  thumbsScheduled = true;
  const run = () => {
    thumbsScheduled = false;
    if (document.hidden) { thumbsNeedsRebuild = true; return; }
    renderThumbsNow();
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
  else setTimeout(run, 500);
}

/* The thumbnail iframes render at a fixed 600 px viewport and are scaled
   down; the scale must follow the tile's real width or the preview is
   clipped at narrow viewports. */
function fitThumbs() {
  document.querySelectorAll('.thumb').forEach(tile => {
    const frame = tile.querySelector('.tthumb');
    if (!frame) return;
    const w = tile.clientWidth || 78;
    frame.style.transform = `scale(${Math.max(0.05, Math.min(0.2, w / 600))})`;
  });
}

/* Thumbnails are 25 iframes; parsing all of them costs more than the tile
   grid is worth on a phone. Render only what is near the viewport, and mark
   each frame so a rebuild re-renders visible tiles but leaves offscreen ones
   for the observer. */
let thumbObserver = null;

function renderThumbFrame(iframe) {
  if (!iframe || iframe.dataset.thumbDone === '1') return;
  const s = clone(state);
  s.design.template = iframe.dataset.tpl;
  let html = renderSignature(s).replace(/src="data:[^"]*"/g, 'src=""');
  if (!remoteImagesOn()) html = html.replace(/(<img\b[^>]*?)\ssrc="https?:\/\/[^"]*"/gi, '$1');
  iframe.srcdoc = html;
  iframe.dataset.thumbDone = '1';
}

function renderThumbsNow() {
  thumbsNeedsRebuild = false;
  const thumbs = [...document.querySelectorAll('.tthumb')];
  if (!thumbs.length) return;
  fitThumbs();
  if (typeof IntersectionObserver !== 'function') {
    thumbs.forEach(renderThumbFrame);
    return;
  }
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        renderThumbFrame(entry.target);
        thumbObserver.unobserve(entry.target);
      }
    }, { rootMargin: '240px' });
  }
  for (const iframe of thumbs) {
    delete iframe.dataset.thumbDone;
    thumbObserver.observe(iframe);
  }
}

/* Autosave is a TRAILING debounce: every edit pushes the timer out, so the
   write always reflects the latest state ~0.7 s after typing stops. The old
   leading-edge throttle silently dropped everything typed within a second
   of the previous save and never caught up. */
let saveTimer = null;

function setSaveStatus(kind) {
  const el = $('#save-state');
  if (!el) return;
  el.dataset.state = kind;
  const key = kind === 'error' ? 'save.error' : kind === 'saving' ? 'save.saving' : 'save.saved';
  el.textContent = t(key);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  setSaveStatus('saving');
  saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, 700);
}

function flushSave() {
  if (!state) return false;
  const ok = saveDraft(state);
  lastSaveAt = Date.now();
  setSaveStatus(ok ? 'saved' : 'error');
  if (!ok) {
    showToast(t('toast.autosaveFail'), 'warn', {
      key: 'toast.autosaveFail',
      action: { label: t('save.free'), fn: openSavedPanel },
    });
  }
  /* Newly added images are packed after the text write; the follow-up save
     replaces them with refs and drops the bytes from localStorage. */
  if (ok && typeof packCurrentImages === 'function') packCurrentImages();
  return ok;
}

window.addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

/* ── field binding ────────────────────────────────────────────────────── */

function onFieldInput(e) {
  const el = e.target;
  if (!el || !el.dataset || !el.dataset.field) return;
  if (typeof tourOnFirstEdit === 'function') tourOnFirstEdit();
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
  else if (el.type === 'number' || el.type === 'range') v = el.value === '' ? '' : Number(el.value);
  else v = el.value;
  setPath(state, el.dataset.field, v);
  if (el.dataset.field === 'design.logoWidth') updateLogoWidthOut();
  if (el.dataset.field === 'design.nameSizeExtra') {
    const o = $('#name-size-out');
    if (o) o.textContent = `+${v} px`;
  }
  if (el.dataset.field === 'design.signatureWidth') {
    const o = $('#width-out');
    if (o) o.textContent = `${v} px`;
  }
  if (el.dataset.field === 'design.socialSize') {
    const o = $('#social-size-out');
    if (o) o.textContent = `${v} px`;
  }
  if (el.dataset.field === 'design.qrSize') {
    const o = $('#qr-size-out');
    if (o) o.textContent = `${v} px`;
  }
  if (el.dataset.field === 'design.nameSpacing') {
    const o = $('#name-spacing-out');
    if (o) o.textContent = `${v} px`;
  }
  renderPreview();
  scheduleSave();
}

function updateLogoWidthOut() {
  $('#logo-width-out').textContent = `${state.design.logoWidth || 72} px`;
}

/* ── drag & drop (socials + custom lines) ─────────────────────────────── */

function clearDropMarks(list) {
  list.querySelectorAll('.drop-above, .drop-below').forEach(r =>
    r.classList.remove('drop-above', 'drop-below'));
}

function renderBoth() {
  renderSocials();
  renderCustoms();
}

function finishDrag(type, beforeIndex) {
  const { index } = dragCtx;
  const arr = type === 'socials' ? state.socials : state.customLines;
  const list = type === 'socials' ? $('#socials-list') : $('#custom-list');
  clearDropMarks(list);
  list.querySelectorAll('.dragging').forEach(r => r.classList.remove('dragging'));
  dragCtx = null;
  if (beforeIndex == null) {
    renderBoth();
    renderPreview();
    return;
  }
  const from = index;
  let to = beforeIndex;
  if (to > from) to -= 1;
  /* to === from means "dropped right below itself" — a genuine no-op.
     Note to === from + 1 is a REAL one-slot-down move (beforeIndex was
     from + 2 before the decrement) and must not be skipped. */
  if (to === from) {
    renderBoth();
    renderPreview();
    return;
  }
  pushHistory('undo.reorder');
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  renderBoth();
  renderPreview();
  scheduleSave();
}

function bindDragDrop(listEl, type) {
  listEl.addEventListener('dragstart', e => {
    if (!e.target.classList || !e.target.classList.contains('row-drag')) return;
    const row = e.target.closest('[data-i]');
    if (!row) return;
    dragCtx = { type, index: Number(row.dataset.i) };
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(dragCtx.index)); } catch (err) { /* ignore */ }
  });
  listEl.addEventListener('dragover', e => {
    if (!dragCtx || dragCtx.type !== type) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('[data-i]');
    clearDropMarks(listEl);
    if (!row || row.classList.contains('dragging')) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-above' : 'drop-below');
  });
  listEl.addEventListener('dragleave', e => {
    if (e.target === listEl) clearDropMarks(listEl);
  });
  listEl.addEventListener('drop', e => {
    if (!dragCtx || dragCtx.type !== type) return;
    e.preventDefault();
    const marked = listEl.querySelector('.drop-above, .drop-below');
    let beforeIndex = null;
    if (marked) {
      const idx = Number(marked.dataset.i);
      beforeIndex = marked.classList.contains('drop-above') ? idx : idx + 1;
    }
    finishDrag(type, beforeIndex);
  });
  listEl.addEventListener('dragend', () => {
    if (dragCtx && dragCtx.type === type) finishDrag(type, null);
  });
}

/* ── socials ──────────────────────────────────────────────────────────── */

function socialRowHtml(soc, i) {
  const net = networkById(soc.network);
  const options = NETWORKS.map(n =>
    `<option value="${n.id}"${n.id === soc.network ? ' selected' : ''}>${esc(n.name)}</option>`).join('');
  const isCustom = soc.network === 'custom';
  const iconOn = !!soc.iconOn;
  const extra = isCustom
    ? `<div class="soc-extra">
         <input type="text" class="soc-glyph" maxlength="3" placeholder="Glyph (1–3 chars)" value="${esc(soc.glyph || '')}">
         <input type="color" class="soc-color" value="${esc(soc.color || '#5b6472')}" title="${t('row.brandColour')}">
       </div>`
    : '';
  const iconRow = iconOn
    ? `<div class="soc-extra">
         <input type="text" class="soc-icon-url" placeholder="Icon image URL (https://…/icon.png)" value="${esc(soc.iconUrl || '')}">
       </div>`
    : '';
  return `<div class="social-row" data-i="${i}">
    <button class="row-btn row-drag" title="${t('row.drag')}" type="button" draggable="true" aria-label="${t('row.drag')}">⠿</button>
    <select class="soc-net" aria-label="Network">${options}</select>
    <input type="text" class="soc-url" placeholder="${esc(net.placeholder || 'https://…')}" value="${esc(soc.url)}">
    <button class="row-btn soc-img${iconOn ? ' on' : ''}" title="${t('row.useImageIcon')}" aria-label="${t('row.useImageIcon')}" type="button">🖼</button>
    <button class="row-btn soc-up" title="${t('row.moveUp')}" aria-label="${t('row.moveUp')}" ${i === 0 ? 'disabled' : ''}>▲</button>
    <button class="row-btn soc-down" title="${t('row.moveDown')}" aria-label="${t('row.moveDown')}" ${i === state.socials.length - 1 ? 'disabled' : ''}>▼</button>
    <button class="row-btn del soc-del" title="${t('row.remove')}" aria-label="${t('row.remove')}">×</button>
    ${extra}
    ${iconRow}
  </div>`;
}

function updateSectionCounts() {
  const cs = $('#count-socials');
  const cc = $('#count-customs');
  if (cs) cs.textContent = state.socials.length;
  if (cc) cc.textContent = state.customLines.length;
}

function renderSocials() {
  const list = $('#socials-list');
  list.innerHTML = state.socials.map((s, i) => socialRowHtml(s, i)).join('') ||
    '<p class="hint">' + t('socials.empty') + '</p>';
  updateSectionCounts();
}

function addSocial(network = 'linkedin') {
  pushHistory('undo.addSocial');
  state.socials.push({ network, url: '', glyph: '', color: '' });
  renderSocials();
  renderPreview();
  scheduleSave();
}

function onSocialListInput(e) {
  const row = e.target.closest('.social-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  const soc = state.socials[i];
  if (!soc) return;
  if (e.target.classList.contains('soc-net')) {
    pushHistory();
    soc.network = e.target.value;
    if (soc.network === 'custom' && !soc.glyph) soc.glyph = '↗';
    renderSocials();
  } else if (e.target.classList.contains('soc-url')) {
    soc.url = e.target.value;
  } else if (e.target.classList.contains('soc-glyph')) {
    soc.glyph = e.target.value;
  } else if (e.target.classList.contains('soc-color')) {
    soc.color = e.target.value;
  } else if (e.target.classList.contains('soc-icon-url')) {
    soc.iconUrl = e.target.value;
  }
  renderPreview();
  scheduleSave();
}

function onSocialListClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = btn.closest('.social-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  const soc = state.socials[i];
  if (btn.classList.contains('soc-img')) {
    pushHistory();
    if (soc.iconOn) {
      soc.iconOn = false;
      soc.iconUrl = '';
    } else {
      soc.iconOn = true;
      soc.iconUrl = soc.iconUrl || '';
    }
    renderSocials();
    renderPreview();
    scheduleSave();
    return;
  }
  if (btn.classList.contains('soc-up') && i > 0) {
    pushHistory();
    [state.socials[i - 1], state.socials[i]] = [state.socials[i], state.socials[i - 1]];
  } else if (btn.classList.contains('soc-down') && i < state.socials.length - 1) {
    pushHistory();
    [state.socials[i], state.socials[i + 1]] = [state.socials[i + 1], state.socials[i]];
  } else if (btn.classList.contains('soc-del')) {
    pushHistory();
    state.socials.splice(i, 1);
  } else {
    return;
  }
  const dir = btn.classList.contains('soc-up') ? -1 : btn.classList.contains('soc-down') ? 1 : 0;
  const movedTo = dir ? i + dir : -1;
  renderSocials();
  if (dir) {
    const row = document.querySelector(`#socials-list .social-row[data-i="${movedTo}"]`);
    const again = row && row.querySelector(dir < 0 ? '.soc-up' : '.soc-down');
    const fallback = row && row.querySelector('.soc-up, .soc-down');
    const target = again && !again.disabled ? again : fallback;
    if (target) target.focus();
  }
  renderPreview();
  scheduleSave();
}

/* ── custom lines ─────────────────────────────────────────────────────── */

function customRowHtml(line, i) {
  return `<div class="custom-row" data-i="${i}">
    <button class="row-btn row-drag" title="${t('row.drag')}" type="button" draggable="true" aria-label="${t('row.drag')}">⠿</button>
    <input type="text" class="line-label" placeholder="Label" value="${esc(line.label)}">
    <input type="text" class="line-value" placeholder="Value" value="${esc(line.value)}">
    <button class="row-btn line-up" title="${t('row.moveUp')}" aria-label="${t('row.moveUp')}" ${i === 0 ? 'disabled' : ''}>▲</button>
    <button class="row-btn line-down" title="${t('row.moveDown')}" aria-label="${t('row.moveDown')}" ${i === state.customLines.length - 1 ? 'disabled' : ''}>▼</button>
    <button class="row-btn del line-del" title="${t('row.remove')}" aria-label="${t('row.remove')}">×</button>
  </div>`;
}

function renderCustoms() {
  const list = $('#custom-list');
  list.innerHTML = state.customLines.map((l, i) => customRowHtml(l, i)).join('');
  updateSectionCounts();
}

function onCustomListInput(e) {
  const row = e.target.closest('.custom-row');
  if (!row) return;
  const line = state.customLines[Number(row.dataset.i)];
  if (!line) return;
  if (e.target.classList.contains('line-label')) line.label = e.target.value;
  else if (e.target.classList.contains('line-value')) line.value = e.target.value;
  renderPreview();
  scheduleSave();
}

function onCustomListClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = btn.closest('.custom-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  if (btn.classList.contains('line-up') && i > 0) {
    pushHistory();
    [state.customLines[i - 1], state.customLines[i]] = [state.customLines[i], state.customLines[i - 1]];
  } else if (btn.classList.contains('line-down') && i < state.customLines.length - 1) {
    pushHistory();
    [state.customLines[i], state.customLines[i + 1]] = [state.customLines[i + 1], state.customLines[i]];
  } else if (btn.classList.contains('line-del')) {
    pushHistory();
    state.customLines.splice(i, 1);
  } else {
    return;
  }
  const dir = btn.classList.contains('line-up') ? -1 : btn.classList.contains('line-down') ? 1 : 0;
  const movedTo = dir ? i + dir : -1;
  renderCustoms();
  if (dir) {
    const row = document.querySelector(`#custom-list .custom-row[data-i="${movedTo}"]`);
    const again = row && row.querySelector(dir < 0 ? '.line-up' : '.line-down');
    const fallback = row && row.querySelector('.line-up, .line-down');
    const target = again && !again.disabled ? again : fallback;
    if (target) target.focus();
  }
  renderPreview();
  scheduleSave();
}

/* ── i18n ─────────────────────────────────────────────────────────────── */

/* Language-switch hook, called by applyI18n() after the static data-i18n
   targets are refreshed. Re-renders every dynamic piece of UI that embeds
   translated strings, and re-translates toasts that are still visible. */
window.onLangChange = function onLangChange() {
  if (!state) return; /* i18n.js boots before app.js initialises state */
  /* The wizard only needs a live re-render when it is actually open —
     re-rendering its five persona thumbnails on every language switch
     would otherwise burn CPU for nothing. */
  const wizard = $('#modal-wizard');
  if (wizard && !wizard.classList.contains('hidden')) {
    renderWizard();
    wizShowStep(wizardStep);
  }
  renderSocials();
  renderCustoms();
  renderThemes();
  updateChecklist();
  updateConciseness();
  renderSavedList();
  document.querySelectorAll('#toasts .toast[data-i18n-key]').forEach(toastEl => {
    let params = null;
    try { params = JSON.parse(toastEl.dataset.i18nParams || 'null'); } catch (e) { /* ignore */ }
    toastEl.textContent = t(toastEl.dataset.i18nKey, params);
  });
};

/* ── conciseness hint ─────────────────────────────────────────────────── */

function updateConciseness() {
  const el = $('#conciseness');
  if (!el) return;
  const s = state;
  let lines = 0;
  if (s.profile.displayName || s.profile.name) lines++;
  if (s.profile.title || s.profile.department) lines++;
  if (s.profile.company) lines++;
  if (s.profile.location || s.profile.languages) lines++;
  if (s.design.statusText) lines++;
  lines += contactItems(s).length;
  lines += s.customLines.filter(l => l.value).length;
  if (s.contact.booking) lines++;
  if (s.socials.some(x => String(x.url || '').trim())) lines++;
  if (s.design.showLegal && s.design.legalText) lines++;
  const cands = [
    s.profile.displayName || s.profile.name,
    [s.profile.title, s.profile.department].filter(Boolean).join(' · '),
    s.profile.company,
    [s.profile.location, s.profile.languages].filter(Boolean).join(' · '),
    s.design.statusText,
    s.contact.address,
    ...contactItems(s).map(i => i.text),
    ...s.customLines.map(l => `${l.label ? l.label + ': ' : ''}${l.value}`),
    s.contact.bookingLabel || t('preview.bookACall'),
    ...s.socials.map(x => networkById(x.network).name),
    s.design.legalText,
  ].filter(Boolean);
  const longest = Math.max(0, ...cands.map(t => String(t).length));
  let verdict, kind;
  if (lines <= 5 && longest <= 60) { verdict = t('concise.good'); kind = 'good'; }
  else if (lines <= 9 && longest <= 90) { verdict = t('concise.fairlyCompact'); kind = 'ok'; }
  else { verdict = t('concise.long'); kind = 'long'; }
  const lineWord = t(lines === 1 ? 'concise.lineWord.one' : 'concise.lineWord.many');
  el.textContent = t('concise.summary', { lines, lineWord, longest, verdict });
  el.className = 'concise-' + kind;
}

/* ── wizard ───────────────────────────────────────────────────────────── */

const WIZARD_DONE_KEY = 'sigstudio.wizard.done';
let wizardChoices = { theme: 'slate', photo: 'none', persona: '' };
let wizardStep = 1;
/* Whether a draft existed when the wizard opened. The tour only plays for
   genuinely new users — if a draft was already there, this is a returning
   visitor re-running the Guide, not a first impression. */
let wizardHadDraft = false;

function renderWizard() {
  $('#wiz-themes').innerHTML = THEMES.map(t =>
    `<button type="button" class="theme-swatch wiz-swatch${wizardChoices.theme === t.id ? ' active' : ''}" data-theme="${t.id}" title="${esc(t.name)}">
       <span class="wiz-swatch-dot" style="background:linear-gradient(135deg, ${t.primary} 50%, ${t.text} 50%);"></span>
       <span class="wiz-swatch-name">${esc(t.name)}</span>
     </button>`
  ).join('');
  $('#wiz-personas').innerHTML = SAMPLE_PERSONAS.map(p =>
    `<button type="button" class="wiz-choice${wizardChoices.persona === p.id ? ' selected' : ''}" data-persona="${p.id}">
       <span class="wiz-choice-name">${esc(p.name)}</span>
       <span class="wiz-persona-thumb" data-persona="${p.id}"></span>
       <span class="wiz-choice-desc">${esc(p.desc)}</span>
     </button>`
  ).join('') + `<button type="button" class="wiz-choice${wizardChoices.persona === '' ? ' selected' : ''}" data-persona="">
       <span class="wiz-choice-name">${esc(t('wiz.startClean'))}</span>
       <span class="wiz-choice-desc">${esc(t('wiz.startCleanDesc'))}</span>
     </button>`;
  renderWizardThumbs();
}

/* Live persona thumbnails in wizard step 3: a scaled-down real render of
   each sample signature. Personas are static, so each thumbnail renders
   once and is cached across selection clicks. */
function renderWizardThumbs() {
  document.querySelectorAll('.wiz-persona-thumb').forEach(box => {
    const pid = box.dataset.persona;
    if (!pid || box.dataset.rendered === pid) return;
    box.dataset.rendered = pid;
    box.innerHTML = '';
    const f = document.createElement('iframe');
    f.className = 'wiz-thumb-frame';
    f.setAttribute('sandbox', '');
    f.setAttribute('tabindex', '-1');
    f.setAttribute('aria-hidden', 'true');
    f.title = '';
    f.srcdoc = renderSignature(sampleState(pid)).replace(/src="data:[^"]*"/g, 'src=""');
    box.appendChild(f);
  });
}

function wizShowStep(n) {
  wizardStep = n;
  for (const i of [1, 2, 3]) {
    const step = $('#wiz-step-' + i);
    step.classList.toggle('hidden', i !== n);
  }
  $('#wiz-step-label').textContent = t('wiz.stepOf', { n });
}

function draftHasContent(d) {
  /* A bare default draft flushed by an unload is not a returning user —
     only actual content marks one. */
  if (!d) return false;
  return Boolean(
    String((d.profile && d.profile.name) || '').trim() ||
    String((d.profile && d.profile.title) || '').trim() ||
    String((d.profile && d.profile.company) || '').trim() ||
    String((d.contact && d.contact.email) || '').trim() ||
    (d.socials || []).length
  );
}

function openWizard() {
  wizardHadDraft = draftHasContent(loadDraft());
  wizShowStep(1);
  renderWizard();
  openOverlay('#modal-wizard');
}

function finishWizard() {
  pushHistory('undo.wizard');
  if (wizardChoices.persona) {
    state = sampleState(wizardChoices.persona);
  }
  applyTheme(state, wizardChoices.theme);
  if (wizardChoices.photo === 'initials') state.design.useMonogram = true;
  closeOverlay('#modal-wizard');
  try { localStorage.setItem(WIZARD_DONE_KEY, '1'); } catch (e) { /* ignore */ }
  rebuildAll();
  scheduleSave();
  showToast(t('toast.allSet'), '', { key: 'toast.allSet' });
  maybeStartTour();
}

function initWizard() {
  $('#btn-guide').addEventListener('click', openWizard);
  $('#wiz-skip').addEventListener('click', () => {
    closeOverlay('#modal-wizard');
    try { localStorage.setItem(WIZARD_DONE_KEY, '1'); } catch (e) { /* ignore */ }
    maybeStartTour();
  });
  $('#wiz-themes').addEventListener('click', e => {
    const b = e.target.closest('.theme-swatch');
    if (!b) return;
    wizardChoices.theme = b.dataset.theme;
    renderWizard();
  });
  document.querySelectorAll('[data-wiz-next]').forEach(b =>
    b.addEventListener('click', () => wizShowStep(Number(b.dataset.wizNext))));
  document.querySelectorAll('[data-wiz-back]').forEach(b =>
    b.addEventListener('click', () => wizShowStep(Number(b.dataset.wizBack))));
  document.querySelectorAll('#wiz-step-2 .wiz-choice').forEach(b =>
    b.addEventListener('click', () => {
      wizardChoices.photo = b.dataset.photo;
      document.querySelectorAll('#wiz-step-2 .wiz-choice').forEach(x => x.classList.toggle('selected', x === b));
    }));
  $('#wiz-personas').addEventListener('click', e => {
    const b = e.target.closest('.wiz-choice');
    if (!b) return;
    wizardChoices.persona = b.dataset.persona || '';
    renderWizard();
  });
  $('#wiz-finish').addEventListener('click', finishWizard);
  /* First run: offer the wizard once. Synchronous — no timers, so it also
     works in throttled/background contexts. The Guide button is recorded
     as the invoker so closing returns focus to it. */
  try {
    if (!localStorage.getItem(WIZARD_DONE_KEY)) {
      $('#btn-guide').focus();
      openWizard();
    }
  } catch (e) { /* ignore */ }
}

/* ── pointer tour ─────────────────────────────────────────────────────── */

/* Four-step spotlight over the live UI, played once right after the
   first-run wizard for genuinely new users (no pre-existing draft). The
   whole overlay is click-through except the tooltip, so the highlighted
   control stays usable while the dim ring focuses attention. */
const TOUR_DONE_KEY = 'sigstudio.tour.done';
const TOUR_STEPS = [
  { sel: '#stage', key: 'tour.step1' },
  { sel: '[data-field="profile.name"]', key: 'tour.step2' },
  { sel: '#btn-export', key: 'tour.step3' },
  { sel: '#checklist', key: 'tour.step4' },
];
let tourStep = 0;
let tourReturnFocus = null;

let tourArmed = false;
function maybeStartTour() {
  try {
    if (localStorage.getItem(TOUR_DONE_KEY)) return;
  } catch (e) { return; }
  if (wizardHadDraft) return; /* a draft already existed → returning user */
  /* Never drop a spotlight bubble over a blank preview straight after the
     wizard: arm the tour and start it on the user's first real edit. */
  tourArmed = true;
}

function tourOnFirstEdit() {
  if (!tourArmed) return;
  tourArmed = false;
  try { if (localStorage.getItem(TOUR_DONE_KEY)) return; } catch (e) { return; }
  openTour();
}

let tourRepositionTimer = null;
function openTour() {
  const overlay = $('#tour-overlay');
  if (!overlay) return;
  tourReturnFocus = document.activeElement;
  /* Unhide first: focus() is a no-op on display:none subtrees, and the
     first step focuses the Next button. */
  overlay.classList.remove('hidden');
  tourShowStep(0);
  /* The tour can now open mid-edit, when the layout is still settling
     (empty-guide vanishing, reflow). Keep the spotlight glued on. */
  if (!tourRepositionTimer) {
    tourRepositionTimer = setInterval(() => {
      const o = $('#tour-overlay');
      if (!o || o.classList.contains('hidden')) { clearInterval(tourRepositionTimer); tourRepositionTimer = null; return; }
      positionTour();
    }, 300);
  }
}

function tourShowStep(n) {
  tourStep = n;
  const overlay = $('#tour-overlay');
  if (!overlay) return;
  const step = TOUR_STEPS[n];
  if (!step) { closeTour(); return; }
  /* If the target lives in a collapsed editor section, unfold it first —
     a spotlight on a hidden element would point at nothing. Then bring it
     into view: a target below the fold (narrow window, stacked layout)
     would leave the hole and tooltip off-screen. */
  const target = document.querySelector(step.sel);
  const host = target && target.closest('details[data-sec]');
  if (host && !host.open) host.open = true;
  if (target) target.scrollIntoView({ block: 'center', behavior: 'auto' });
  $('#tour-text').textContent = t(step.key);
  overlay.dataset.step = String(n + 1);
  positionTour();
  $('#tour-next').focus();
}

function positionTour() {
  const spot = $('#tour-spot');
  const tip = $('#tour-tip');
  const step = TOUR_STEPS[tourStep];
  const target = document.querySelector(step.sel);
  const rect = target ? target.getBoundingClientRect() : null;
  if (!rect || !rect.width || !rect.height) return;
  /* Pad the hole a little so the element sits comfortably inside the ring. */
  const pad = 6;
  spot.style.top = `${rect.top - pad}px`;
  spot.style.left = `${rect.left - pad}px`;
  spot.style.width = `${rect.width + pad * 2}px`;
  spot.style.height = `${rect.height + pad * 2}px`;
  /* Tooltip under the hole, flipping above when the viewport runs out. */
  const tipRect = tip.getBoundingClientRect();
  let top = rect.bottom + 14;
  if (top + tipRect.height > window.innerHeight - 12) {
    top = Math.max(8, rect.top - tipRect.height - 14);
  }
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - tipRect.width / 2),
    window.innerWidth - tipRect.width - 8
  );
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function closeTour() {
  const overlay = $('#tour-overlay');
  if (overlay) overlay.classList.add('hidden');
  try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch (e) { /* ignore */ }
  if (tourReturnFocus && tourReturnFocus.isConnected && tourReturnFocus.getClientRects().length) {
    tourReturnFocus.focus();
  }
  tourReturnFocus = null;
}

function initTour() {
  $('#tour-next').addEventListener('click', () => {
    if (tourStep + 1 >= TOUR_STEPS.length) closeTour();
    else tourShowStep(tourStep + 1);
  });
  $('#tour-skip').addEventListener('click', closeTour);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const overlay = $('#tour-overlay');
    if (overlay && !overlay.classList.contains('hidden')) closeTour();
  });
  window.addEventListener('resize', () => {
    const overlay = $('#tour-overlay');
    if (overlay && !overlay.classList.contains('hidden')) positionTour();
  });
}

/* ── quick-switch saved signatures ────────────────────────────────────── */

function renderQuickMenu() {
  const snaps = listSnapshots();
  const menu = $('#quick-menu');
  if (!snaps.length) {
    menu.innerHTML = '<span class="menu-empty">' + t('quick.empty') + '</span>';
    return;
  }
  const def = defaultSnapId();
  const ordered = snaps.slice().sort((a, b) => (b.id === def) - (a.id === def));
  menu.innerHTML = ordered.slice(0, 6).map(snap => {
    const d = new Date(snap.savedAt);
    const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `<button role="menuitem" type="button" data-snap="${snap.id}">
      <span class="qs-name">${snap.id === def ? '<span class="qs-star" aria-hidden="true">★</span> ' : ''}${esc(snap.name)}</span>
      <span class="qs-date">${when}</span>
    </button>`;
  }).join('');
}

function initQuickSwitch() {
  const menu = $('#quick-menu');
  $('#btn-quick').addEventListener('click', e => {
    e.stopPropagation();
    renderQuickMenu();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#quick-wrap')) menu.classList.add('hidden');
  });
  menu.addEventListener('click', async e => {
    const b = e.target.closest('[data-snap]');
    if (!b) return;
    const loaded = await loadSnapshotHydrated(b.dataset.snap);
    if (loaded) {
      pushHistory('undo.load');
      state = normalizeLoadedState(loaded);
      menu.classList.add('hidden');
      rebuildAll();
      scheduleSave();
      showToast(t('toast.switched'), '', { key: 'toast.switched' });
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') menu.classList.add('hidden');
  });
}

/* ── pre-export checklist ─────────────────────────────────────────────── */

/* Every warning names the control that fixes it (data-field path or a
   section id) so the checklist can jump there. */
/* WCAG contrast meter: a 12-hex palette is easy to get wrong, so show the
   ratio and the AA/AAA verdict against the signature background. */
function hexToRgb(hex) {
  const s = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-f]{3,8}$/i.test(s)) return null;
  const full = s.length === 3 || s.length === 4
    ? s.split('').map(c => c + c).join('')
    : s;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function renderContrastMeter() {
  const el = $('#contrast-meter');
  if (!el || !state) return;
  const d = state.design;
  const bg = /^#[0-9a-f]{3,8}$/i.test(String(d.background || '')) ? d.background : '#ffffff';
  const rows = [
    ['contrast.text', d.textColor],
    ['contrast.muted', mutedColor(Object.assign({}, d, { mutedColor: d.mutedColor }))],
    ['contrast.link', d.linkColor || d.primaryColor],
  ];
  el.innerHTML = rows.map(([key, fg]) => {
    const ratio = contrastRatio(fg, bg);
    const ok = ratio !== null && ratio >= 4.5;
    const grade = ratio === null ? '—' : ok ? (ratio >= 7 ? 'AAA' : 'AA') : t('contrast.belowAA');
    return `<span class="cm-row ${ok ? 'ok' : 'bad'}"><span>${esc(t(key))}</span>` +
      `<b>${ratio === null ? '—' : ratio.toFixed(1) + ':1'}</b><i>${esc(grade)}</i></span>`;
  }).join('');
}

/* ── contact line order (Advanced) ─────────────────────────────────────── */
const CONTACT_ORDER_KEYS = ['email', 'email2', 'phone', 'mobile', 'website', 'portfolio', 'pgp', 'address'];
let contactOrderSig = '';

function contactOrderKeys() {
  const present = contactItems(state, state.design).map(i => i.key);
  const known = CONTACT_ORDER_KEYS.filter(k => present.includes(k));
  const stored = Array.isArray(state.design.contactOrder) ? state.design.contactOrder : [];
  return [...new Set([...stored.filter(k => known.includes(k)), ...known])];
}

function renderContactOrder() {
  const el = $('#contact-order');
  if (!el) return;
  const keys = contactOrderKeys();
  const sig = keys.join(',');
  if (sig === contactOrderSig) return;
  contactOrderSig = sig;
  if (!keys.length) {
    el.innerHTML = `<span class="micro">${esc(t('order.empty'))}</span>`;
    return;
  }
  el.innerHTML = keys.map((k, i) => {
    const label = t('field.' + k);
    return `<span class="order-row">
      <span class="order-name">${esc(label)}</span>
      <button type="button" class="co-move" data-key="${k}" data-dir="-1"${i === 0 ? ' disabled' : ''}
        aria-label="${esc(t('order.moveUp'))}: ${esc(label)}">↑</button>
      <button type="button" class="co-move" data-key="${k}" data-dir="1"${i === keys.length - 1 ? ' disabled' : ''}
        aria-label="${esc(t('order.moveDown'))}: ${esc(label)}">↓</button>
    </span>`;
  }).join('');
}

function initContactOrder() {
  const el = $('#contact-order');
  if (!el) return;
  el.addEventListener('click', ev => {
    const b = ev.target.closest('.co-move');
    if (!b) return;
    const keys = contactOrderKeys();
    const i = keys.indexOf(b.dataset.key);
    const j = i + Number(b.dataset.dir);
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    state.design.contactOrder = keys;
    contactOrderSig = '';
    renderContactOrder();
    renderPreview();
    scheduleSave();
    const again = el.querySelector(`.co-move[data-key="${b.dataset.key}"][data-dir="${b.dataset.dir}"]`);
    if (again) again.focus();
  });
}

/* Availability presets write the badge text and colour in one click; the
   date only matters for "on leave". */
function initStatusPresets() {
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.status-preset');
    if (!b) return;
    const preset = b.dataset.status;
    const colors = { available: '#2f9e44', remote: '#1c7ed6', leave: '#b45309' };
    let text = t('status.' + preset);
    if (preset === 'leave') {
      const dateEl = $('#status-date');
      if (dateEl && dateEl.value) {
        const dt = new Date(dateEl.value + 'T00:00:00');
        if (!Number.isNaN(dt.getTime())) {
          text = t('status.leaveUntil', { date: dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) });
        }
      }
    }
    state.design.statusText = text;
    state.design.statusColor = colors[preset] || '#2f9e44';
    const input = document.querySelector('[data-field="design.statusText"]');
    const colour = document.querySelector('[data-field="design.statusColor"]');
    if (input) input.value = text;
    if (colour) colour.value = state.design.statusColor;
    renderPreview();
    scheduleSave();
    showToast(text, '', { key: 'toast.status' });
  });
}

/* Narrow screens get a jump list instead of a long scroll. Options are read
   from the live section titles, so translations and reordering follow. */
function initSectionJump() {
  const sel = $('#sec-jump');
  if (!sel) return;
  const sections = [...document.querySelectorAll('#main details[data-sec]')];
  const fill = () => {
    sel.innerHTML = sections.map(sec => {
      const label = sec.querySelector('summary [data-i18n]');
      return `<option value="${esc(sec.dataset.sec)}">${esc(label ? label.textContent : sec.dataset.sec)}</option>`;
    }).join('');
  };
  fill();
  sel.addEventListener('focus', fill);
  sel.addEventListener('change', () => {
    const sec = sections.find(d => d.dataset.sec === sel.value);
    if (!sec) return;
    sec.open = true;
    sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const summary = sec.querySelector('summary');
    if (summary) setTimeout(() => summary.focus({ preventScroll: true }), 250);
  });
}

/* PWA share target: another app can share a vCard or an HTML signature to
   the installed app. Only importable content is consumed; the query is
   cleaned so a reload does not re-open the modal. */
function consumeShareTarget() {
  const params = new URLSearchParams(location.search);
  if (!params.has('text') && !params.has('title') && !params.has('url')) return;
  const text = [params.get('title'), params.get('text'), params.get('url')]
    .filter(Boolean).join('\n');
  if (!/BEGIN:VCARD|<table|<html|<br/i.test(text)) return;
  history.replaceState(null, '', location.pathname);
  openOverlay('#modal-import');
  const src = $('#import-src');
  if (src) {
    src.value = text;
    src.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (/BEGIN:VCARD/i.test(text)) {
    const vcard = document.querySelector('input[name="importMode"][value="vcard"]');
    if (vcard) {
      vcard.checked = true;
      vcard.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

/* One starred snapshot is the default variant; the quick menu floats it. */
const DEFAULT_SNAP_KEY = 'sigstudio.defaultSnap';

function defaultSnapId() {
  try { return localStorage.getItem(DEFAULT_SNAP_KEY) || ''; } catch (e) { return ''; }
}

function setDefaultSnap(id) {
  try {
    if (id) localStorage.setItem(DEFAULT_SNAP_KEY, id);
    else localStorage.removeItem(DEFAULT_SNAP_KEY);
  } catch (e) { /* ignore */ }
}

/* One definition of "valid" for both the checklist and the inline hints. */
function validEmail(v) {
  const s = String(v || '').trim();
  return !s || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}
function validPhone(v) {
  const s = String(v || '').trim();
  return !s || s.replace(/\D/g, '').length >= 6;
}
function validSite(v) {
  const s = String(v || '').trim();
  return !s || !!normalizeUrl('custom', s);
}

/* Inline error text for the three fields where a typo silently produces a
   dead link or an unreachable address. Runs on every preview render. */
function applyFieldErrors() {
  const rules = [
    ['contact.email', validEmail, 'field.errEmail'],
    ['contact.phone', validPhone, 'field.errPhone'],
    ['contact.website', validSite, 'field.errUrl'],
  ];
  for (const [path, ok, key] of rules) {
    const el = document.querySelector(`[data-field="${path}"]`);
    if (!el) continue;
    const field = el.closest('.field') || el.parentElement;
    if (!field) continue;
    let note = field.querySelector('.field-error');
    if (ok(getPath(state, path))) {
      if (note) note.remove();
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
      continue;
    }
    if (!note) {
      note = document.createElement('span');
      note.className = 'field-error';
      note.id = 'err-' + path.replace(/[^a-z0-9]+/gi, '-');
      field.appendChild(note);
    }
    note.textContent = t(key);
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', note.id);
  }
}

function collectWarnings(s) {
  const w = [];
  if (!s.profile.displayName && !s.profile.name) {
    w.push({ kind: 'err', msg: t('check.noName'), target: 'profile.name' });
  }
  if (!String(s.contact.email || '').trim()) {
    w.push({ kind: 'warn', msg: t('check.noEmail'), target: 'contact.email' });
  }
  if (String(s.design.logoUrl || '').startsWith('data:')) {
    w.push({ kind: 'warn', msg: t('check.logoEmbedded'), target: 'design.logoUrl' });
  }
  if (String(s.design.bannerUrl || '').startsWith('data:')) {
    w.push({ kind: 'warn', msg: t('check.bannerEmbedded'), target: 'design.bannerUrl' });
  }
  if (!s.design.strictOutlook && (s.design.showCard || photoShapeOf(s) !== 'square')) {
    w.push({ kind: 'info', msg: t('check.roundedOutlook'), target: 'design.strictOutlook' });
  }
  if (s.design.showQr) {
    w.push({ kind: 'info', msg: t('check.embeddedQr'), target: 'design.showQr' });
  }
  if (s.design.customHtml && String(s.design.customHtml).trim()) {
    w.push({ kind: 'warn', msg: t('check.customHtml'), target: 'design.customHtml' });
  }
  if (cidImagesActive(s.design)) {
    const hasImg = s.design.logoUrl || s.design.bannerUrl || s.design.footerLeftImg ||
      s.design.footerCenterImg || s.design.footerRightImg ||
      (s.socials || []).some(x => String(x.iconUrl || '').trim());
    if (hasImg) w.push({ kind: 'warn', msg: t('check.cidImages'), target: 'design.imageRef.logo' });
  }
  /* Format checks: junk values pass silently today and only show up as a
     dead link or an unreachable address in the sent signature. */
  const email = String(s.contact.email || '').trim();
  if (!validEmail(email)) {
    w.push({ kind: 'warn', msg: t('check.badEmail'), target: 'contact.email' });
  }
  const phone = String(s.contact.phone || '').trim();
  if (!validPhone(phone)) {
    w.push({ kind: 'warn', msg: t('check.badPhone'), target: 'contact.phone' });
  }
  const site = String(s.contact.website || '').trim();
  if (!validSite(site)) {
    w.push({ kind: 'warn', msg: t('check.badUrl'), target: 'contact.website' });
  }
  /* Unbroken tokens force a horizontal scrollbar in Word-engine Outlook. */
  const longFields = [
    ['profile.name', s.profile.name], ['profile.company', s.profile.company],
    ['profile.title', s.profile.title], ['contact.website', site],
  ];
  for (const [target, value] of longFields) {
    if (/\S{46,}/.test(String(value || ''))) {
      w.push({ kind: 'info', msg: t('check.longLine'), target });
      break;
    }
  }
  for (const soc of s.socials) {
    if (!String(soc.url || '').trim()) {
      w.push({ kind: 'info', msg: t('check.networkNoLink', { net: esc(networkById(soc.network).name) }), target: '@section:socials' });
    }
  }
  return w;
}

function updateChecklist() {
  const el = $('#checklist');
  if (!el) return;
  const w = collectWarnings(state);
  const announce = $('#check-announce');
  if (announce) {
    const text = w.length ? t('check.countAnnounce', { n: w.length }) : t('check.readyAnnounce');
    if (announce.textContent !== text) announce.textContent = text;
  }
  if (!w.length) {
    el.innerHTML = '<div class="check-ok">' + t('check.ready') + '</div>';
  } else {
    el.innerHTML = w.map(x =>
      `<button type="button" class="check-item check-${x.kind}" data-check-target="${esc(x.target || '')}">${x.msg}<span class="check-go" aria-hidden="true">→</span></button>`
    ).join('');
  }
  updateTrustBadge();
}

/* ── empty-state preview guide ────────────────────────────────────────── */

/* A callout over the preview stage until a name exists: the single most
   valuable next action on a blank editor. Toggled on every preview pass. */
function updateEmptyGuide() {
  const guide = $('#empty-guide');
  if (!guide) return;
  const named = Boolean(
    String(state.profile.name || '').trim() ||
    String(state.profile.displayName || '').trim()
  );
  guide.classList.toggle('hidden', named);
}

/* ── live trust badge ─────────────────────────────────────────────────── */

/* One glance at the preview column header: green when buildAudit reports
   nothing to warn about, amber with a count otherwise. Re-computed on
   every checklist pass, so it tracks the editor keystroke-for-keystroke. */
function updateTrustBadge() {
  const badge = $('#trust-badge');
  if (!badge) return;
  let warns = 0;
  try {
    warns = buildAudit(state).items.filter(i => i.kind === 'warn').length;
  } catch (e) { /* keep the previous verdict if the audit throws */ }
  if (warns === 0) {
    badge.textContent = t('badge.ok');
    badge.className = 'trust-badge ok';
  } else {
    badge.textContent = warns === 1 ? t('badge.fixOne') : t('badge.fix', { n: warns });
    badge.className = 'trust-badge warn';
  }
}

/* ── rebuild everything ───────────────────────────────────────────────── */

function rebuildAll() {
  document.querySelectorAll('[data-field]').forEach(el => {
    const v = getPath(state, el.dataset.field);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = (el.value === v);
    else el.value = v ?? '';
  });
  renderSocials();
  renderCustoms();
  updateTemplatePicker();
  updateLogoWidthOut();
  const nso = $('#name-size-out');
  if (nso) nso.textContent = `+${state.design.nameSizeExtra ?? 3} px`;
  const wo = $('#width-out');
  if (wo) wo.textContent = `${state.design.signatureWidth ?? 600} px`;
  const sso = $('#social-size-out');
  if (sso) sso.textContent = `${state.design.socialSize ?? 22} px`;
  const qo = $('#qr-size-out');
  if (qo) qo.textContent = `${state.design.qrSize ?? 60} px`;
  const spo = $('#name-spacing-out');
  if (spo) spo.textContent = `${state.design.nameSpacing ?? 0} px`;
  updateSavedCount();
  renderThemes();
  renderPreview();
}

/* Custom template: the section-order editor (drag + arrows). */
function renderBlockList() {
  const list = $('#blocks-list');
  if (!list) return;
  const order = state.design.blockOrder || DEFAULT_BLOCK_ORDER;
  list.textContent = '';
  order.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'block-row';
    row.draggable = true;
    row.dataset.block = b;
    row.innerHTML = `<span class="drag" aria-hidden="true">⠿</span><span class="block-name">${esc(t('custom.block' + b.charAt(0).toUpperCase() + b.slice(1)))}</span>` +
      `<button type="button" class="btn btn-sm row-btn" data-move="${i}" data-dir="-1" data-i18n-aria="custom.moveUp" aria-label="Move up">▲</button>` +
      `<button type="button" class="btn btn-sm row-btn" data-move="${i}" data-dir="1" data-i18n-aria="custom.moveDown" aria-label="Move down">▼</button>`;
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); });
    row.addEventListener('dragover', e => { e.preventDefault(); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isFinite(from) || from === i) return;
      moveBlock(from, i);
    });
    list.appendChild(row);
  });
  list.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.move);
    const to = i + Number(btn.dataset.dir);
    if (to < 0 || to >= order.length) return;
    moveBlock(i, to);
  }));
}

function moveBlock(from, to) {
  pushHistory('undo.reorder');
  const order = (state.design.blockOrder || DEFAULT_BLOCK_ORDER).slice();
  const [b] = order.splice(from, 1);
  order.splice(to, 0, b);
  state.design.blockOrder = order;
  renderBlockList();
  const moved = document.querySelector(`#blocks-list .block-row[data-block="${b}"]`);
  const dir = to > from ? 1 : -1;
  const again = moved && moved.querySelector(`[data-dir="${dir}"]`);
  const fallback = moved && moved.querySelector('[data-dir]');
  const target = again && !again.disabled ? again : fallback;
  if (target) target.focus();
  renderPreview();
  scheduleSave();
}

function updateTemplatePicker() {
  document.querySelectorAll('.tpl-btn').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.template === state.design.template));
  });
  const isCustom = state.design.template === 'custom';
  $('#custom-blocks').classList.toggle('hidden', !isCustom);
  if (isCustom) renderBlockList();
  updateLogoPositionUI();
}

/* Logo position matters for the side-logo layouts (Banner renders its
   content through the Classic layout, so it supports sides too); disable
   it (with a hint) on the fixed-placement ones. */
function updateLogoPositionUI() {
  const sel = $('#logo-position');
  const hint = $('#logo-pos-hint');
  if (!sel) return;
  const relevant = ['classic', 'compact', 'split', 'banner'].includes(state.design.template);
  sel.disabled = !relevant;
  if (hint) hint.hidden = relevant;
}

function updateSavedCount() {
  $('#saved-count').textContent = listSnapshots().length;
}

/* ── colour themes ────────────────────────────────────────────────────── */

/* Template picker: categories come from TEMPLATES metadata, so a new layout
   is one entry — it cannot drift out of the filter or lose its badge. */
function initTemplatePicker() {
  const picker = $('#tpl-picker');
  if (!picker || typeof TEMPLATES === 'undefined') return;
  TEMPLATES.forEach(def => {
    const btn = picker.querySelector(`.tpl-btn[data-template="${def.id}"]`);
    if (!btn) return;
    btn.dataset.category = def.category || 'personal';
    btn.dataset.rec = RECOMMENDED_TEMPLATES.has(def.id) ? '1' : '0';
    if (def.badge && !btn.querySelector('.tpl-badge')) {
      const chip = document.createElement('span');
      chip.className = `tpl-badge tpl-badge-${def.badge}`;
      chip.textContent = t(`tpl.badge${def.badge.charAt(0).toUpperCase()}${def.badge.slice(1)}`);
      btn.appendChild(chip);
    }
  });
  const bar = $('#tpl-filter');
  if (!bar) return;
  bar.addEventListener('click', ev => {
    const b = ev.target.closest('.tpl-cat');
    if (!b) return;
    bar.querySelectorAll('.tpl-cat').forEach(x => {
      const on = x === b;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-pressed', String(on));
    });
    applyTemplateFilter();
  });
  const search = $('#tpl-search');
  if (search) search.addEventListener('input', applyTemplateFilter);
  applyTemplateFilter();
}

/* Picker curation: the six layouts a first-time user should see, plus a
   text search over the 25 names and categories. */
const RECOMMENDED_TEMPLATES = new Set(['classic', 'minimal', 'photocard', 'split', 'booking', 'reply']);

function applyTemplateFilter() {
  const picker = $('#tpl-picker');
  const bar = $('#tpl-filter');
  const search = $('#tpl-search');
  if (!picker || !bar) return;
  const active = bar.querySelector('.tpl-cat.is-on');
  const cat = active ? active.dataset.cat : 'all';
  const q = String((search && search.value) || '').trim().toLowerCase();
  let shown = 0;
  picker.querySelectorAll('.tpl-btn').forEach(btn => {
    const name = (btn.querySelector('.tpl-name') || {}).textContent || '';
    const id = btn.dataset.template || '';
    const category = btn.dataset.category || '';
    const rec = btn.dataset.rec === '1';
    const catOk = cat === 'all' || (cat === 'start' ? rec : category === cat);
    const qOk = !q || name.toLowerCase().includes(q) || id.toLowerCase().includes(q) || category.includes(q);
    const on = catOk && qOk;
    btn.classList.toggle('hidden', !on);
    if (on) shown += 1;
  });
  const count = $('#tpl-count');
  if (count) count.textContent = t('tpl.count', { n: shown });
  const empty = $('#tpl-empty');
  if (empty) empty.classList.toggle('hidden', shown > 0);
}

function renderThemes() {
  const row = $('#themes-row');
  if (!row) return;
  const btns = THEMES.map(t => {
    const active = state.design.primaryColor.toLowerCase() === t.primary &&
      state.design.textColor.toLowerCase() === t.text &&
      state.design.dividerColor.toLowerCase() === t.divider;
    return `<button type="button" class="theme-swatch${active ? ' active' : ''}" data-theme="${t.id}" ` +
      `title="${esc(t.name)}" aria-label="${esc(t.name)}" style="background:linear-gradient(135deg, ${t.primary} 50%, ${t.text} 50%);"></button>`;
  }).join('');
  row.innerHTML = '<span class="hint">' + t('design.colourThemes') + '</span>' + btns;
}

function onThemeClick(e) {
  const b = e.target.closest('.theme-swatch');
  if (!b) return;
  const theme = themeById(b.dataset.theme);
  if (!theme) return;
  state.design.primaryColor = theme.primary;
  state.design.textColor = theme.text;
  state.design.mutedColor = theme.muted || '';
  state.design.dividerColor = theme.divider;
  renderThemes();
  const primary = document.querySelector('[data-field="design.primaryColor"]');
  const text = document.querySelector('[data-field="design.textColor"]');
  const divider = document.querySelector('[data-field="design.dividerColor"]');
  if (primary) primary.value = theme.primary;
  if (text) text.value = theme.text;
  if (divider) divider.value = theme.divider;
  renderPreview();
  scheduleSave();
  showToast(t('toast.themeApplied', { name: theme.name }), '', { key: 'toast.themeApplied', params: { name: theme.name } });
}

/* ── toasts ───────────────────────────────────────────────────────────── */

function showToast(msg, kind = '', meta) {
  const toastEl = document.createElement('div');
  toastEl.className = 'toast' + (kind ? ' ' + kind : '');
  toastEl.textContent = msg;
  /* Remember the key (and params) so a live language switch can re-translate
     toasts that are still on screen. */
  if (meta && meta.action) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast-action';
    action.textContent = meta.action.label;
    action.addEventListener('click', e => {
      e.stopPropagation();
      meta.action.fn();
      toastEl.remove();
    });
    toastEl.appendChild(action);
  }
  if (meta && meta.key) {
    toastEl.dataset.i18nKey = meta.key;
    if (meta.params) toastEl.dataset.i18nParams = JSON.stringify(meta.params);
    /* One live toast per key: six identical "could not save" messages
       stacking is noise, not information. */
    const existing = [...document.querySelectorAll('#toasts .toast')]
      .find(el => el.dataset.i18nKey === meta.key);
    if (existing) existing.remove();
  }
  $('#toasts').appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 3200);
}

/* ── modals & overlays ────────────────────────────────────────────────── */

/* Focusable elements inside an overlay, for focus trapping. Visibility is
   checked per element so hidden wizard steps and display:none inputs drop
   out of the cycle. */
const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), iframe:not([tabindex="-1"]), ' +
  'summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function getFocusables(container) {
  return [...container.querySelectorAll(FOCUSABLE_SEL)].filter(el => el.getClientRects().length > 0);
}

/* Keep Tab inside a modal panel and close it on Escape. Returns a disposer
   so the listener disappears with the panel. */
function trapInPanel(container, onEscape) {
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const f = getFocusables(container);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

/* Opening an overlay records the invoking control and moves focus into the
   dialog (WCAG 2.4.3 focus order); closing restores focus to the invoker.
   Restore is skipped when the invoker has since been hidden or removed. */
const overlayReturnFocus = new WeakMap();

function openOverlay(id) {
  const ov = $(id);
  if (!ov) return;
  const opener = document.activeElement;
  if (opener && opener !== document.body && !ov.contains(opener)) {
    overlayReturnFocus.set(ov, opener);
  }
  ov.classList.remove('hidden');
  const focusables = getFocusables(ov);
  const autofocus = ov.querySelector('[data-autofocus]');
  const target = (autofocus && focusables.includes(autofocus)) ? autofocus : focusables[0];
  if (target) target.focus();
}

function closeOverlay(id) {
  const ov = $(id);
  if (!ov) return;
  ov.classList.add('hidden');
  const back = overlayReturnFocus.get(ov);
  overlayReturnFocus.delete(ov);
  if (back && back.isConnected && back.getClientRects().length > 0) {
    back.focus();
  } else if (document.activeElement && ov.contains(document.activeElement)) {
    /* No valid invoker to return to: park focus on <main> so the next Tab
       resumes from a sensible place instead of a hidden dialog. */
    const main = $('#main');
    if (main) main.focus();
  }
}

function showConfirm(title, body, onOk) {
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  openOverlay('#modal-confirm');
  const ok = $('#confirm-ok');
  const handler = () => { ok.removeEventListener('click', handler); closeOverlay('#modal-confirm'); onOk(); };
  ok.addEventListener('click', handler);
}

/* ── export ───────────────────────────────────────────────────────────── */

function photoShapeOf(s) {
  return s.design.photoShape || (s.design.roundPhoto ? 'circle' : 'square');
}

/* Rounded corners Word-engine Outlook will render square, when strict
   mode is off. Lists the features currently producing them. */
function outlookIssues(s) {
  if (s.design.strictOutlook) return [];
  const issues = [];
  const shape = photoShapeOf(s);
  if (shape !== 'square') issues.push(shape === 'circle' ? t('outlook.issue.roundPhoto') : t('outlook.issue.roundedPhoto'));
  if (s.design.showCard) issues.push(t('outlook.issue.card'));
  if (s.design.useMonogram) issues.push(t('outlook.issue.monogram'));
  if (String(s.design.statusText || '').trim()) issues.push(t('outlook.issue.statusBadge'));
  if (String(s.contact.booking || '').trim()) issues.push(t('outlook.issue.booking'));
  if (s.socials.some(x => String(x.url || '').trim())) issues.push(t('outlook.issue.socials'));
  return issues;
}

let pendingExport = null;

/* Intercept HTML exports when the signature carries rounded corners that
   Outlook desktop will square off. The user can export as-is, or switch
   strict mode on and export the Outlook-honest version. */
function guardOutlookExport(fn) {
  /* Hard failures block the copy until acknowledged; warnings fall through
     to the existing rounding dialogue. */
  if (runCompatGate(fn)) return;
  const issues = outlookIssues(state);
  if (!issues.length) {
    fn();
    return;
  }
  pendingExport = fn;
  $('#outlook-issues').textContent =
    t('outlook.summary', { issues: issues.join(', ') });
  openOverlay('#modal-outlook');
}

async function doCopy() {
  const html = renderSignature(state);
  const plain = plainTextVersion(state);
  const how = await copySignature(html, plain);
  if (how === 'failed') {
    showToast(t('toast.clipboardBlockedDownload'), 'err', { key: 'toast.clipboardBlockedDownload' });
    showManualCopy(html);
  } else {
    showToast(t('toast.copied'), '', { key: 'toast.copied' });
  }
}

/* Share link: compress the whole state into a URL. Embedded images ride
   along, and random pixel data does not compress — a 120 KB logo becomes a
   200 KB link. Beyond ~8 KB such a URL is not just awkward, it is REFUSED:
   nginx's default request-line limit is 8 KB and many hosts answer 414.
   So the default copies a link that works (images omitted) and says so;
   "Copy link with images" in the menu forces the full one. */
const SHARE_BIG = 8000;

function stateWithoutImages(s) {
  const c = clone(s);
  for (const k of ['logoUrl', 'bannerUrl', 'footerLeftImg', 'footerCenterImg', 'footerRightImg']) {
    if (String(c.design[k] || '').startsWith('data:')) c.design[k] = '';
  }
  c.socials = (c.socials || []).map(x => Object.assign({}, x, {
    iconUrl: String(x.iconUrl || '').startsWith('data:') ? '' : x.iconUrl,
  }));
  return c;
}

function shareUrlFor(src) {
  return `${location.origin}${location.pathname}?sig=${lzwEncode(JSON.stringify(src))}`;
}

/* A QR needs the state small enough to fit ~2.9 KB. Strip everything that
   equals the default (normalizeLoadedState restores it on load), which cuts
   a typical signature by more than half without changing the result. */
function compactStateForShare(s) {
  const prune = (obj, defaults) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const dv = defaults ? defaults[k] : undefined;
      if (v && typeof v === 'object' && !Array.isArray(v) && dv && typeof dv === 'object' && !Array.isArray(dv)) {
        const sub = prune(v, dv);
        if (Object.keys(sub).length) out[k] = sub;
      } else if (JSON.stringify(v) !== JSON.stringify(dv)) {
        out[k] = v;
      }
    }
    return out;
  };
  return prune(clone(s), defaultState());
}

async function doShareLink({ forceFull = false } = {}) {
  const fullUrl = shareUrlFor(state);
  const overLimit = fullUrl.length > SHARE_BIG;
  const omitImages = overLimit && !forceFull;
  const url = omitImages ? shareUrlFor(stateWithoutImages(state)) : fullUrl;
  const kb = Math.round(fullUrl.length / 1024);

  const how = await copySignature(url, url);
  if (how === 'failed') {
    showToast(t('toast.clipboardBlocked'), 'err', { key: 'toast.clipboardBlocked' });
    showManualCopy(url);
    return;
  }
  if (omitImages) {
    showToast(t('share.plainForSize', { kb }), 'warn',
      { key: 'share.plainForSize', params: { kb } });
  } else if (overLimit) {
    showToast(t('share.tooBig', { kb }), 'warn', { key: 'share.tooBig', params: { kb } });
  } else {
    showToast(t('share.copied'), '', { key: 'share.copied' });
  }
}

/* C1: show exactly what the CSV will do before anything is generated. */
function renderBulkPreview() {
  const box = $('#bulk-preview');
  if (!box) return;
  const plan = bulkPlan(state, $('#bulk-csv').value);
  if (plan.empty) { box.innerHTML = `<p class="bulk-more">${esc(t('bulk.noRows'))}</p>`; return; }
  if (plan.noEmailColumn) { box.innerHTML = `<p class="bulk-more">${esc(t('bulk.noEmailColumn'))}</p>`; return; }
  const statusLabel = row => t(row.status === 'ready' ? 'bulk.ready'
    : row.status === 'noName' ? 'bulk.skipNoName'
      : row.status === 'noEmail' ? 'bulk.skipNoEmail' : 'bulk.skipDuplicate');
  const shown = plan.rows.slice(0, 25);
  const rowsHtml = shown.map(row => `
    <tr data-status="${row.status}">
      <td>${row.line}</td>
      <td class="trunc">${esc(row.name || '—')}</td>
      <td class="trunc">${esc(row.email || '—')}</td>
      <td class="trunc">${row.status === 'ready' ? esc(row.filename) : statusLabel(row)}</td>
    </tr>`).join('');
  const more = plan.rows.length > shown.length
    ? `<p class="bulk-more">${esc(t('bulk.moreRows', { n: plan.rows.length - shown.length }))}</p>` : '';
  box.innerHTML = `<table class="bulk-table">
    <thead><tr><th>#</th><th>${esc(t('bulk.colName'))}</th><th>${esc(t('bulk.colEmail'))}</th><th>${esc(t('bulk.colStatus'))}</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>${more}`;
}

function openBulk() {
  $('#bulk-result').textContent = '';
  renderBulkPreview();
  openOverlay('#modal-bulk');
  setTimeout(() => $('#bulk-csv').focus(), 30);
}

/* Export the current signature as a ZIP with its CID image parts and
   manifest — the pipeline-ready package for one signature, no CSV. */
async function doCidZip() {
  if (!cidImagesActive(state.design)) {
    showToast(t('toast.cidZipNone'), 'warn', { key: 'toast.cidZipNone' });
    return;
  }
  const files = await singleCidPackage(state);
  const zip = zipStore(files);
  const blob = new Blob([zip], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(state.meta.name)}-signature.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  showToast(t('toast.cidZipDone'), '', { key: 'toast.cidZipDone' });
}

async function runBulk() {
  const csv = $('#bulk-csv').value;
  const res = bulkGenerate(state, csv);
  const line = $('#bulk-result');
  if (res.noEmailColumn) {
    line.textContent = t('bulk.noEmail');
    return;
  }
  if (!res.files.length) {
    line.textContent = t('bulk.noRows');
    return;
  }
  const files = res.files.slice();
  if (state.design && cidImagesActive(state.design)) {
    line.textContent = t('bulk.optimizing');
    const m = await bulkAssetsAsync(state);
    if (m) {
      files.push({ name: 'manifest.json', data: JSON.stringify(m.manifest, null, 2) });
      for (const a of m.assets) files.push({ name: a.name, data: a.data });
    }
  }
  const zip = zipStore(files);
  const blob = new Blob([zip], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(state.meta.name)}-signatures.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  line.textContent = t('bulk.result', { n: res.generated, m: res.skipped });
}

function openAudit() {
  const r = buildAudit(state);
  const list = $('#audit-list');
  list.textContent = '';
  for (const item of r.items) {
    const li = document.createElement('li');
    li.className = `audit-${item.kind}`;
    li.textContent = item.text;
    list.appendChild(li);
  }
  $('#audit-summary').textContent = r.summary;
  openOverlay('#modal-audit');
}

function downloadAudit() {
  downloadRawFile(auditTextReport(state), `${slugify(state.meta.name)}-audit.txt`, 'text/plain');
}

/* Raw JSON editing: the preset format. */
function openJsonEditor() {
  $('#json-text').value = JSON.stringify(state, null, 2);
  openOverlay('#modal-json');
  setTimeout(() => $('#json-text').focus(), 30);
}

function applyJsonEditor() {
  let parsed;
  try {
    parsed = JSON.parse($('#json-text').value);
  } catch (e) {
    showToast(t('json.invalid'), 'err', { key: 'json.invalid' });
    return;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.design || !parsed.profile) {
    showToast(t('json.invalid'), 'err', { key: 'json.invalid' });
    return;
  }
  pushHistory('undo.json'); /* replacing the whole state must be undoable */
  state = normalizeLoadedState(parsed);
  closeOverlay('#modal-json');
  rebuildAll();
  scheduleSave();
  showToast(t('json.apply'), 'ok', { key: 'json.apply' });
}

/* Bare table fragment for CMS / signature-management tools. */
async function doCopyFragment() {
  if (typeof renderFragment !== 'function') {
    showToast(t('toast.fragmentUnavailable'), 'err', { key: 'toast.fragmentUnavailable' });
    return;
  }
  const how = await copySignature(renderFragment(state), plainTextVersion(state));
  if (how === 'failed') {
    showToast(t('toast.clipboardBlocked'), 'err', { key: 'toast.clipboardBlocked' });
    showManualCopy(renderFragment(state));
  } else {
    showToast(t('toast.fragmentCopied'), '', { key: 'toast.fragmentCopied' });
  }
}

/* ── presets (JSON brand kits) ────────────────────────────────────────── */

/* ── test email (client proof kit) ───────────────────────────────────── */

function testEmailHtml() {
  const copy = JSON.parse(JSON.stringify(state));
  const d = copy.design || (copy.design = {});
  d.imageRef = d.imageRef || {};
  /* Only inline what can travel inside the message. A hosted image stays a
     URL; turning it into a cid: without a part would guarantee a hole. */
  const pairs = [
    ['banner', 'bannerUrl'],
    ['footerLeft', 'footerLeftImg'], ['footerCenter', 'footerCenterImg'],
    ['footerRight', 'footerRightImg'],
  ];
  for (const [ref, field] of pairs) {
    if (/^data:image\//i.test(String(d[field] || ''))) d.imageRef[ref] = 'cid';
  }
  /* The light and dark logos share one CID switch; only use it when every
     present variant can travel as an attachment. */
  const logoPair = [d.logoUrl, d.logoDarkUrl].filter(v => String(v || '').trim());
  if (logoPair.length && logoPair.every(v => /^data:image\//i.test(String(v)))) {
    d.imageRef.logo = 'cid';
  }
  const socials = (copy.socials || []).filter(x => String(x.iconUrl || '').trim());
  if (socials.length && socials.every(x => /^data:image\//i.test(String(x.iconUrl)))) {
    d.imageRef.socials = 'cid';
  }
  return { copy, html: renderSignature(copy) };
}

function mimeB64(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

function mimeB64Bytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

function mimePhrase(str) {
  const s = String(str || '').trim();
  if (/^[\x20-\x7e]*$/.test(s)) return `"${s.replace(/["\\]/g, '\\$&')}"`;
  return `=?UTF-8?B?${mimeB64(s).replace(/\r\n/g, '')}?=`;
}

/* multipart/alternative: a plain-text checklist and the real signature. If
   images were inlined, the HTML part sits in multipart/related so their
   Content-IDs resolve even with remote images blocked. */
function testEmailAddress() {
  return String((state.profile && state.profile.email)
    || (state.contact && state.contact.email) || '').trim();
}

async function buildTestEml() {
  const { copy, html } = testEmailHtml();
  const assets = await bulkAssetsAsync(copy);
  const address = testEmailAddress();
  const name = String((copy.profile && (copy.profile.displayName || copy.profile.name)) || copy.meta.name || 'Signature').trim();
  const subject = t('test.subject', { name });
  const draft = `${t('test.greeting')}\n\n${t('test.checklist')}\n\n${t('test.replyNote')}`;
  const alt = `sigstudio-alt-${Date.now().toString(36)}`;
  const rel = `sigstudio-rel-${Date.now().toString(36)}`;
  const cidOf = new Map();
  if (assets && assets.manifest) {
    for (const img of assets.manifest.images) {
      if (img.file) cidOf.set(img.file, img.cid);
    }
  }
  let body = `--${alt}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeB64(draft)}\r\n`;
  if (assets && assets.assets.length) {
    body += `--${alt}\r\nContent-Type: multipart/related; boundary="${rel}"; type="text/html"\r\n\r\n`;
    body += `--${rel}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeB64(html)}\r\n`;
    for (const a of assets.assets) {
      const cid = cidOf.get(a.name) || `sigstudio-${String(a.name).replace(/^.*?([a-z0-9-]+)\.[a-z]+$/i, '$1')}`;
      const file = String(a.name).split('/').pop();
      body += `--${rel}\r\nContent-Type: ${a.mime || 'application/octet-stream'}; name="${file}"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${cid}>\r\nContent-Disposition: inline; filename="${file}"\r\n\r\n${mimeB64Bytes(a.data)}\r\n`;
    }
    body += `--${rel}--\r\n`;
  } else {
    body += `--${alt}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${mimeB64(html)}\r\n`;
  }
  body += `--${alt}--\r\n`;
  const headers = [
    `From: ${mimePhrase(name)} <${address}>`,
    `To: ${mimePhrase(name)} <${address}>`,
    `Subject: =?UTF-8?B?${mimeB64(subject).replace(/\r\n/g, '')}?=`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    '',
  ].join('\r\n');
  return headers + body;
}

async function doDownloadTestEml() {
  const address = testEmailAddress();
  if (!address) {
    showToast(t('test.needEmail'), 'err', {
      key: 'test.needEmail',
      action: {
        label: t('test.needEmailAction'),
        fn: () => {
          const field = document.querySelector('[data-field="profile.email"]');
          if (field) {
            field.focus();
            field.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        },
      },
    });
    return;
  }
  const eml = await buildTestEml();
  downloadBlob(new Blob([eml], { type: 'message/rfc822' }), `signature-test-${slugify(state.meta.name)}.eml`);
  showToast(t('test.downloaded'), '', { key: 'test.downloaded' });
}

function openTestModal() {
  const pre = $('#test-checklist');
  if (pre) pre.textContent = t('test.checklist');
  openOverlay('#modal-test');
}

async function doCopyTestChecklist() {
  try {
    await navigator.clipboard.writeText(t('test.checklist'));
    showToast(t('test.checklistCopied'), '', { key: 'test.checklistCopied' });
  } catch (e) {
    showToast(t('toast.copyFail'), 'err', { key: 'toast.copyFail' });
  }
}

function updateBimiDomainHint() {
  const input = $('#bimi-domain');
  const hint = $('#bimi-domain-hint');
  if (!input || !hint) return;
  const domain = typeof normalizeDomain === 'function' ? normalizeDomain(input.value) : String(input.value || '').trim().toLowerCase();
  const mailbox = domain === 'mailbox.org' || domain.endsWith('.mailbox.org');
  hint.classList.toggle('hidden', !mailbox);
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* One ZIP with the draft, every saved signature and an index — the escape
   hatch for a cleared browser or a new machine. */
async function backupFiles() {
  const snaps = listSnapshots();
  const draft = typeof refsForStorage === 'function' ? refsForStorage(state) : state;
  const files = [{ name: 'draft.json', data: JSON.stringify(draft, null, 2) }];
  /* Images are blobs in IndexedDB; include them so the archive is complete. */
  const ids = new Set();
  const states = [draft, ...snaps.map(s => s && s.state).filter(Boolean)];
  for (const st of states) {
    for (const { obj, key } of imageSlots(st)) {
      const value = String(obj[key] || '');
      if (value.startsWith('idb:')) ids.add(value.slice(4));
    }
  }
  for (const id of ids) {
    try {
      const blob = await imgGet(id);
      if (!blob) continue;
      files.push({ name: `images/${id}.bin`, data: new Uint8Array(await blob.arrayBuffer()) });
    } catch (e) { /* skip unreadable blob */ }
  }
  snaps.forEach((snap, i) => {
    const stem = slugify(snap.name) || 'signature';
    files.push({
      name: `saved/${String(i + 1).padStart(2, '0')}-${stem}.json`,
      data: JSON.stringify(snap, null, 2),
    });
  });
  files.push({
    name: 'backup.json',
    data: JSON.stringify({
      app: 'signature-studio',
      version: APP_VERSION,
      createdAt: new Date().toISOString(),
      snapshots: snaps.map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt })),
    }, null, 2),
  });
  files.push({
    name: 'README.txt',
    data: [
      'Signature Studio backup',
      '',
      'draft.json        the signature that was open when you exported',
      'saved/*.json      every saved signature, one file each',
      'backup.json      index: app version, export time, saved names',
      '',
      'Keep this ZIP somewhere safe. Saved signatures live only in your browser;',
      'clearing site data erases them.',
      '',
    ].join('\n'),
  });
  return files;
}

const LAST_BACKUP_KEY = 'sigstudio.lastBackup.v1';

function lastBackupAt() {
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  const t0 = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t0) ? t0 : 0;
}

/* Write, then read the archive back before calling it a backup. A ZIP that
   cannot be re-opened is worse than no backup: it looks like safety. */
async function doBackup() {
  const files = await backupFiles();
  const zip = zipStore(files);
  try {
    const entries = unzipStore(zip);
    const index = entries.find(e => e.name === 'backup.json');
    if (!index) throw new Error('missing index');
    const parsed = JSON.parse(new TextDecoder().decode(index.data));
    if (!parsed || parsed.app !== 'signature-studio') throw new Error('bad index');
  } catch (e) {
    showToast(t('backup.verifyFail'), 'err', { key: 'backup.verifyFail' });
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  downloadBlob(new Blob([zip], { type: 'application/zip' }), `signature-studio-backup-${stamp}.zip`);
  showToast(t('toast.backupDone', { n: listSnapshots().length }), '', { key: 'toast.backupDone' });
  updateImageNote();
}

/* Classic Outlook on Windows reads a signature from a folder:
   %APPDATA%\Microsoft\Signatures\<name>.htm plus a sibling <name>_files
   folder. Hosted URLs stay remote; only data URIs become local files. */
function outlookPackFiles() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.design.imageRef = {};
  delete copy.design.imageMode;
  const slug = slugify(state.meta.name || (state.profile && state.profile.name) || 'signature') || 'signature';
  const folder = `${slug}_files`;
  let html = renderSignature(copy);
  const files = [];
  const addImage = (b64, mime) => {
    let ext = String(mime || 'png').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';
    ext = ext.replace(/[^a-z0-9]/g, '') || 'png';
    const name = `${folder}/image-${files.length + 1}.${ext}`;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      files.push({ name, data: bytes });
    } catch (e) {
      return '';
    }
    return name;
  };
  html = html.replace(/(src=")data:image\/([a-zA-Z0-9.+-]+);base64,([^"]+)"/g,
    (m, pre, mime, b64) => {
      const name = addImage(b64, mime);
      return name ? `${pre}${name}"` : m;
    });
  html = html.replace(/url\(data:image\/([a-zA-Z0-9.+-]+);base64,([^)]+)\)/g,
    (m, mime, b64) => {
      const name = addImage(b64, mime);
      return name ? `url(${name})` : m;
    });
  return [{ name: `${slug}.htm`, data: html }]
    .concat(files)
    .concat([{ name: 'README.txt', data: t('outlookPack.readme', { name: `${slug}.htm`, folder }) }]);
}

function doOutlookPack() {
  const files = outlookPackFiles();
  const slug = slugify(state.meta.name || 'signature') || 'signature';
  downloadBlob(new Blob([zipStore(files)], { type: 'application/zip' }), `${slug}-outlook.zip`);
  showToast(t('toast.outlookPack'), '', { key: 'toast.outlookPack' });
}

/* Restore a backup ZIP: draft, saved signatures, or both. Merge keeps what
   is already saved; replace clears the saved list first. */
let pendingRestore = null;

async function beginRestore(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let entries;
  try {
    entries = unzipStore(bytes);
  } catch (e) {
    showToast(t('restore.badZip'), 'err', { key: 'restore.badZip' });
    return;
  }
  const dec = new TextDecoder();
  const readJson = entry => {
    try { return JSON.parse(dec.decode(entry.data)); } catch (e) { return null; }
  };
  const draftEntry = entries.find(e => e.name === 'draft.json');
  const draft = draftEntry ? readJson(draftEntry) : null;
  const snaps = entries
    .filter(e => /^saved\/.+\.json$/.test(e.name))
    .map(readJson)
    .filter(x => x && x.state && typeof x.state === 'object');
  if (!draft && !snaps.length) {
    showToast(t('restore.empty'), 'err', { key: 'restore.empty' });
    return;
  }
  /* Stored images arrive as separate blobs; put them back before applying. */
  for (const entry of entries.filter(e => /^images\/[^/]+\.bin$/.test(e.name))) {
    const id = entry.name.slice('images/'.length, -'.bin'.length);
    try { await imgPut(id, new Blob([entry.data])); } catch (e) { /* ignore */ }
  }
  pendingRestore = { draft, snaps };
  $('#restore-summary').textContent = t('restore.summary', { n: snaps.length });
  openOverlay('#modal-restore');
}

async function applyRestore(mode) {
  if (!pendingRestore) return;
  const { draft, snaps } = pendingRestore;
  pendingRestore = null;
  pushHistory('undo.restore');
  if (mode === 'replace') {
    try { localStorage.removeItem(SAVED_KEY); } catch (e) { /* ignore */ }
  }
  for (const snap of snaps) {
    saveSnapshot(snap.state, snap.name || (snap.state.meta && snap.state.meta.name) || 'Restored');
  }
  if (draft) {
    state = normalizeLoadedState(draft);
    if (typeof unpackImages === 'function') await unpackImages(state);
  }
  closeOverlay('#modal-restore');
  if (typeof gcImages === 'function') gcImages(historyImageIds());
  rebuildAll();
  renderSavedList();
  scheduleSave();
  showToast(t('toast.restored', { n: snaps.length }), '', { key: 'toast.restored', params: { n: snaps.length } });
}

function doExportPreset() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${slugify(state.meta.name)}-preset.json`);
  showToast(t('toast.presetExported'), '', { key: 'toast.presetExported' });
}

function doImportPresetFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object' || !parsed.design || !parsed.profile) {
        throw new Error('bad shape');
      }
      pushHistory('undo.import');
      state = normalizeLoadedState(parsed);
      rebuildAll();
      scheduleSave();
      showToast(t('toast.presetImported'), '', { key: 'toast.presetImported' });
    } catch (err) {
      showToast(t('toast.presetInvalid'), 'err', { key: 'toast.presetInvalid' });
    }
  };
  reader.readAsText(file);
}

/* Read a saved email's HTML part into the existing importer. .msg is an OLE2
   container, not MIME — detected early with a clear instruction. */
async function importEmlFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (typeof isCompoundFile === 'function' && isCompoundFile(bytes)) {
    showToast(t('import.msgNotSupported'), 'warn', { key: 'import.msgNotSupported' });
    return;
  }
  const parsed = parseEml(new TextDecoder('utf-8').decode(bytes));
  const body = parsed.html || parsed.plain;
  if (!body) {
    showToast(t('import.emlEmpty'), 'err', { key: 'import.emlEmpty' });
    return;
  }
  const htmlMode = document.querySelector('input[name="importMode"][value="html"]');
  if (htmlMode) {
    htmlMode.checked = true;
    htmlMode.dispatchEvent(new Event('change', { bubbles: true }));
  }
  openOverlay('#modal-import');
  $('#import-src').value = body;
  doImportParse();
  showToast(t('import.emlLoaded', { subject: parsed.subject || file.name }), '', { key: 'toast.emlLoaded' });
}

/* ── vCard + QR ───────────────────────────────────────────────────────── */

function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/* A 240 px square JPEG for vCard PHOTO — small enough to keep the card
   portable, big enough to read in a contact list. */
async function vcardPhotoDataUrl() {
  const src = String(state.design.portraitUrl || state.design.logoUrl || '');
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) return '';
  try {
    const img = await loadImageAsync(src);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) return '';
    const out = Math.min(240, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    return '';
  }
}

async function doVCard() {
  const photo = await vcardPhotoDataUrl();
  const vcf = buildVCard(state, photo ? { photoDataUrl: photo } : {});
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  downloadBlob(blob, `${slugify(state.meta.name)}.vcf`);
  showToast(t('toast.vcardDownloaded'), '', { key: 'toast.vcardDownloaded' });
}

/* Plain text for list mail, text-only clients and screen readers. */
function plainTextSignature(s) {
  const p = s.profile || {};
  const c = s.contact || {};
  const d = s.design || {};
  const lines = [];
  const name = [p.honorificPrefix, p.name, p.honorificSuffix].filter(Boolean).join(' ').trim();
  lines.push(name + (p.pronouns ? ` (${p.pronouns})` : ''));
  const role = [p.title, p.department].filter(Boolean).join(' · ');
  if (role) lines.push(role);
  if (p.company) lines.push(p.company);
  if (p.tagline && d.showTagline !== false) lines.push(p.tagline);
  if (d.altBlock && d.showTagline !== false) {
    if (d.altLabel) lines.push(d.altLabel);
    lines.push(...String(d.altBlock).split(/\r?\n/));
  }
  const ctx = [p.location, p.languages, p.timezone].filter(Boolean).join(' · ');
  if (ctx) lines.push(ctx);
  lines.push('');
  for (const it of contactItems(s, d)) {
    lines.push(`${it.label ? it.label + ': ' : ''}${it.text}`);
  }
  const socialBits = (Array.isArray(s.socials) ? s.socials : [])
    .map(sc => {
      const url = typeof socialUrlFor === 'function' ? socialUrlFor(sc) : '';
      return url ? `${sc.label || sc.network || 'Link'}: ${url}` : '';
    })
    .filter(Boolean);
  if (socialBits.length) {
    lines.push('');
    lines.push(...socialBits);
  }
  if (c.booking && d.showBooking !== false) {
    lines.push(`Booking: ${normalizeUrl('custom', c.booking)}`);
  }
  const legal = String(d.legalText || '').trim();
  if (d.showLegal && legal) {
    lines.push('');
    lines.push(legal);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function doPlainText() {
  const blob = new Blob([plainTextSignature(state)], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${slugify(state.meta.name)}.txt`);
  showToast(t('toast.plainDownloaded'), '', { key: 'toast.plainDownloaded' });
}

/* Gmail clips around 102 KB of HTML; surfacing the real size stops a heavy
   signature from silently eating the message budget. */
function signatureWeight() {
  const html = renderSignature(state);
  const bytes = new TextEncoder().encode(html).length;
  return { bytes, kb: bytes / 1024 };
}

function senderIdentity() {
  const p = state.profile || {};
  const name = [p.honorificPrefix, p.name, p.honorificSuffix].filter(Boolean).join(' ').trim();
  return `${name || t('menu.noName')} <${(state.contact && state.contact.email) || t('menu.noEmail')}>`;
}

function updateExportNotes() {
  const note = $('#weight-note');
  if (note) {
    const w = signatureWeight();
    note.textContent = t('menu.weight', { kb: w.kb.toFixed(1), limit: 102 });
    note.classList.toggle('warn', w.kb >= 60);
  }
  const sender = $('#sender-note');
  if (sender) sender.textContent = senderIdentity();
}

function contactCardFiles(photoDataUrl) {
  const csv = String(($('#bulk-csv') && $('#bulk-csv').value) || '');
  const plan = bulkPlan(state, csv);
  return plan.rows
    .filter(r => r.status === 'ready')
    .map(r => {
      const own = String((r.state.contact && r.state.contact.photoUrl) || '').trim();
      const opts = /^https?:\/\//i.test(own)
        ? { photoUri: normalizeUrl('custom', own) }
        : (photoDataUrl ? { photoDataUrl } : {});
      return {
        name: r.filename.replace(/\.html$/i, '.vcf'),
        data: buildVCard(r.state, opts),
      };
    });
}

async function doContactCardsZip() {
  /* A headshot belongs to one person; only a shared logo is safe to copy
     onto every team member's card. */
  const shared = state.design.portraitUrl ? '' : await vcardPhotoDataUrl();
  const files = contactCardFiles(shared);
  if (!files.length) {
    showToast(t('toast.cardsNone'), 'warn', { key: 'toast.cardsNone' });
    return;
  }
  const zip = zipStore(files);
  const blob = new Blob([zip], { type: 'application/zip' });
  downloadBlob(blob, `${slugify(state.meta.name)}-contact-cards.zip`);
  showToast(t('toast.cardsDownloaded', { n: files.length }), '', { key: 'toast.cardsDownloaded', params: { n: files.length } });
}

function doVCard4() {
  if (typeof buildVCard4 !== 'function') {
    showToast(t('toast.vcard4Unavailable'), 'err', { key: 'toast.vcard4Unavailable' });
    return;
  }
  const vcf = buildVCard4(state);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  downloadBlob(blob, `${slugify(state.meta.name)}-v4.vcf`);
  showToast(t('toast.vcard4Downloaded'), '', { key: 'toast.vcard4Downloaded' });
}

function drawQr(canvas, text, ecc = 'M') {
  if (typeof qrcode !== 'function') return false;
  const qr = qrcode(0, ecc);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = 264;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#141824';
  const cell = size / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  return true;
}

function doShowQR() {
  const vcf = buildVCard(state);
  if (!drawQr($('#qr-canvas'), vcf, 'M')) {
    showToast(t('toast.qrFailed'), 'err', { key: 'toast.qrFailed' });
    return;
  }
  $('#qr-caption').textContent =
    t('qr.caption', { name: state.profile.name || state.meta.name || 'this contact' });
  const note = $('#qr-note');
  if (note) { note.setAttribute('data-i18n', 'qr.note'); note.textContent = t('qr.note'); }
  openOverlay('#modal-qr');
}

/* C3: a QR of the share link — the phone handoff without pasting 4 KB. */
function doShowShareQR() {
  const url = shareUrlFor(stateWithoutImages(compactStateForShare(state)));
  if (url.length > 2900) {
    showToast(t('share.qrTooLong'), 'warn', { key: 'share.qrTooLong' });
    return;
  }
  if (!drawQr($('#qr-canvas'), url, url.length > 1200 ? 'L' : 'Q')) {
    showToast(t('toast.qrFailed'), 'err', { key: 'toast.qrFailed' });
    return;
  }
  $('#qr-caption').textContent = t('qr.shareCaption', { kb: Math.round(url.length / 1024) || 1 });
  const note = $('#qr-note');
  if (note) { note.setAttribute('data-i18n', 'qr.shareNote'); note.textContent = t('qr.shareNote'); }
  openOverlay('#modal-qr');
}

/* ── import ───────────────────────────────────────────────────────────── */

function summarizeParsed(p) {
  const parts = [];
  if (p.profile.name) parts.push(`<b>${t('import.labelName')}</b> ${esc(p.profile.name)}`);
  if (p.profile.title) parts.push(`<b>${t('import.labelTitle')}</b> ${esc(p.profile.title)}`);
  if (p.profile.department) parts.push(`<b>${t('import.labelDepartment')}</b> ${esc(p.profile.department)}`);
  if (p.contact.email) parts.push(`<b>${t('import.labelEmail')}</b> ${esc(p.contact.email)}`);
  if (p.contact.phone) parts.push(`<b>${t('import.labelPhone')}</b> ${esc(p.contact.phone)}`);
  if (p.contact.mobile) parts.push(`<b>${t('import.labelMobile')}</b> ${esc(p.contact.mobile)}`);
  if (p.contact.website) parts.push(`<b>${t('import.labelWebsite')}</b> ${esc(p.contact.website)}`);
  if (p.socials.length) parts.push(`<b>${t('import.labelSocials')}</b> ${p.socials.map(x => esc(networkById(x.network).name)).join(', ')}`);
  if (p.design.logoUrl) parts.push(`<b>${t('import.labelLogo')}</b> ${t('import.found')}`);
  if (p.design.bannerUrl) parts.push(`<b>${t('import.labelBanner')}</b> ${t('import.found')}`);
  if (p.design.legalText) parts.push(`<b>${t('import.labelLegal')}</b> ${t('import.found')}`);
  parts.push(...p.notes.map(n => `<i>${esc(n)}</i>`));
  return parts.join('<br>');
}

/* vCard mode: parse the pasted .vcf into a field set and offer a merge. */
function doVCardParse() {
  const raw = $('#import-src').value;
  const v = parseVCard(raw);
  const summary = $('#import-summary');
  const applyRow = $('#import-apply-row');
  summary.classList.remove('hidden');
  if (v.error) {
    summary.innerHTML = t('import.vcardNothing');
    applyRow.classList.add('hidden');
    lastParsedImport = null;
    return;
  }
  const found = [];
  if (v.profile.name) found.push(t('field.name'));
  if (v.contact.email) found.push(t('field.email'));
  if (v.contact.phone) found.push(t('field.phone'));
  if (v.contact.mobile) found.push(t('field.mobile'));
  if (v.profile.title) found.push(t('field.title'));
  if (v.profile.company) found.push(t('field.company'));
  if (v.contact.website) found.push(t('field.website'));
  if (v.profile.pronouns) found.push(t('field.pronouns'));
  if (v.contact.pgpKey) found.push(t('field.pgp'));
  if (!found.length) {
    summary.innerHTML = t('import.vcardNothing');
    applyRow.classList.add('hidden');
    lastParsedImport = null;
    return;
  }
  summary.innerHTML = t('import.vcardSummary', { fields: found.join(', ') }) +
    (v.photoIgnored ? ` <span class="micro">${t('import.vcardPhotoIgnored')}</span>` : '');
  applyRow.classList.remove('hidden');
  lastParsedImport = { kind: 'vcard', vcard: v };
}

function doImportParse() {
  const chips = $('#import-fields');
  if (chips) { chips.innerHTML = ''; chips.classList.add('hidden'); }
  const mode = (document.querySelector('input[name="importMode"]:checked') || {}).value || 'html';
  if (mode === 'vcard') {
    doVCardParse();
    return;
  }
  const raw = $('#import-src').value;
  const p = parseSignatureHTML(raw);
  const summary = $('#import-summary');
  const applyRow = $('#import-apply-row');
  const foundSomething = p.profile.name || p.contact.email || p.contact.phone || p.contact.website ||
    p.socials.length || p.design.logoUrl || p.design.legalText;
  if (!foundSomething) {
    summary.innerHTML = t('import.nothingFound');
    summary.classList.remove('hidden');
    applyRow.classList.add('hidden');
    lastParsedImport = null;
    return;
  }
  summary.innerHTML = summarizeParsed(p);
  summary.classList.remove('hidden');
  applyRow.classList.remove('hidden');
  renderImportFields(p);
  lastParsedImport = p;
}

/* C2: let people take only the fields they trust. The summary says the
   import is best-effort; chips make that actionable instead of all-or-
   nothing. */
const IMPORT_FIELDS = [
  ['profile.name', 'field.name', p => p.profile.name],
  ['profile.title', 'field.title', p => p.profile.title],
  ['profile.department', 'field.department', p => p.profile.department],
  ['profile.company', 'field.company', p => p.profile.company],
  ['contact.email', 'field.email', p => p.contact.email],
  ['contact.phone', 'field.phone', p => p.contact.phone],
  ['contact.mobile', 'field.mobile', p => p.contact.mobile],
  ['contact.website', 'field.website', p => p.contact.website],
  ['design.logoUrl', 'import.logo', p => p.design.logoUrl],
  ['design.legalText', 'import.legal', p => p.design.legalText],
  ['socials', 'sec.socials', p => (p.socials || []).length ? p.socials.map(s => s.network).join(', ') : ''],
];

function importWanted(path) {
  const box = document.querySelector(`[data-import-field="${path}"]`);
  return !box || box.checked;
}

function renderImportFields(p) {
  const box = $('#import-fields');
  if (!box) return;
  const rows = IMPORT_FIELDS
    .map(([path, key, get]) => {
      const v = get(p);
      return v ? { path, key, value: Array.isArray(v) ? v.join(', ') : String(v) } : null;
    })
    .filter(Boolean);
  box.innerHTML = rows.length
    ? `<p class="micro">${esc(t('import.choose'))}</p>` + rows.map(r => `
      <label class="import-chip">
        <input type="checkbox" checked data-import-field="${r.path}">
        <span>${esc(t(r.key))}: <b>${esc(r.value.slice(0, 60))}</b></span>
      </label>`).join('')
    : '';
  box.classList.toggle('hidden', !rows.length);
}

function doImportApply() {
  if (!lastParsedImport) return;
  const p = lastParsedImport;
  pushHistory('undo.import');
  if (p.kind === 'vcard') {
    /* Merge-only: absent fields keep their current values. */
    const v = p.vcard;
    const pick = (a, b) => a === undefined || a === '' ? b : a;
    state.profile.name = pick(v.profile.name, state.profile.name);
    state.profile.title = pick(v.profile.title, state.profile.title);
    state.profile.company = pick(v.profile.company, state.profile.company);
    state.profile.department = pick(v.profile.department, state.profile.department);
    state.profile.pronouns = pick(v.profile.pronouns, state.profile.pronouns);
    state.profile.birthday = pick(v.profile.birthday, state.profile.birthday);
    state.profile.languages = pick(v.profile.languages, state.profile.languages);
    state.profile.honorificPrefix = pick(v.profile.honorificPrefix, state.profile.honorificPrefix);
    state.profile.honorificSuffix = pick(v.profile.honorificSuffix, state.profile.honorificSuffix);
    state.contact.email = pick(v.contact.email, state.contact.email);
    state.contact.phone = pick(v.contact.phone, state.contact.phone);
    state.contact.mobile = pick(v.contact.mobile, state.contact.mobile);
    state.contact.website = pick(v.contact.website, state.contact.website);
    state.contact.address = pick(v.contact.address, state.contact.address);
    state.contact.pgpKey = pick(v.contact.pgpKey, state.contact.pgpKey);
    closeOverlay('#modal-import');
    rebuildAll();
    scheduleSave();
    showToast(t('toast.imported'), '', { key: 'toast.imported' });
    lastParsedImport = null;
    return;
  }
  if (p.profile.name && importWanted('profile.name')) state.profile.name = p.profile.name;
  if (p.profile.title && importWanted('profile.title')) state.profile.title = p.profile.title;
  if (p.profile.department && importWanted('profile.department')) state.profile.department = p.profile.department;
  if (p.profile.company && importWanted('profile.company')) state.profile.company = p.profile.company;
  if (p.contact.email && importWanted('contact.email')) state.contact.email = p.contact.email;
  if (p.contact.phone && importWanted('contact.phone')) state.contact.phone = p.contact.phone;
  if (p.contact.mobile && importWanted('contact.mobile')) state.contact.mobile = p.contact.mobile;
  if (p.contact.website && importWanted('contact.website')) state.contact.website = p.contact.website;
  if (p.socials.length && importWanted('socials')) state.socials = p.socials;
  if (p.design.logoUrl && importWanted('design.logoUrl')) state.design.logoUrl = p.design.logoUrl;
  if (p.design.bannerUrl) state.design.bannerUrl = p.design.bannerUrl;
  if (p.design.logoPosition) state.design.logoPosition = p.design.logoPosition;
  if (p.design.legalText && importWanted('design.legalText')) {
    state.design.showLegal = true;
    state.design.legalText = p.design.legalText;
  }
  closeOverlay('#modal-import');
  rebuildAll();
  scheduleSave();
  showToast(t('toast.imported'), '', { key: 'toast.imported' });
}

/* ── saved panel ──────────────────────────────────────────────────────── */

function savedItemHtml(snap) {
  return `<div class="saved-item" data-id="${snap.id}">
    <div>
      <div class="si-name">${esc(snap.name)}</div>
      <div class="si-date">${new Date(snap.savedAt).toLocaleString()}</div>
      <div class="si-size">${fmtSize(JSON.stringify(snap.state).length)}</div>
    </div>
    <div class="si-actions">
      <button class="btn btn-sm snap-default" aria-pressed="${defaultSnapId() === snap.id}"
        title="${esc(t('saved.defaultHint'))}" aria-label="${esc(t('saved.defaultHint'))}">${defaultSnapId() === snap.id ? '★' : '☆'}</button>
      <button class="btn btn-sm snap-load">${t('saved.load')}</button>
      <button class="btn btn-sm snap-del">${t('saved.delete')}</button>
    </div>
  </div>`;
}

/* Storage accounting. localStorage holds UTF-16 text; Chrome's per-origin
   budget is ~5 MB of characters, and the draft plus every snapshot share
   it. Show the real number instead of letting a save fail mysteriously. */
const STORAGE_BUDGET = 5 * 1024 * 1024;

function storageUsageChars() {
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) n += k.length + (localStorage.getItem(k) || '').length;
  } catch (e) { /* ignore */ }
  return n;
}

function fmtSize(chars) {
  const kb = chars / 1024;
  const lang = document.documentElement.lang || 'en';
  const nf = digits => new Intl.NumberFormat(lang, { maximumFractionDigits: digits });
  return kb >= 1024 ? nf(1).format(kb / 1024) + ' MB' : nf(0).format(Math.round(kb)) + ' KB';
}

async function updateImageNote() {
  const el = $('#storage-image-note');
  if (!el) return;
  if (typeof idbAvailable !== 'function' || !idbAvailable()) {
    el.textContent = '';
    return;
  }
  try {
    const ids = await imgKeys();
    el.textContent = ids.length ? t('saved.imagesNote', { n: ids.length }) : '';
  } catch (e) {
    el.textContent = '';
  }
  const pnote = $('#storage-persist-note');
  let mode = 'unsupported';
  if (pnote) {
    mode = typeof persistenceStatus === 'function' ? await persistenceStatus() : 'unsupported';
    const key = mode === 'granted' ? 'saved.persistGranted'
      : mode === 'denied' ? 'saved.persistDenied' : 'saved.persistUnsupported';
    pnote.textContent = t(key);
    pnote.dataset.state = mode;
  }
  const ageEl = $('#backup-age');
  if (ageEl) {
    const at = typeof lastBackupAt === 'function' ? lastBackupAt() : 0;
    if (!at) {
      ageEl.textContent = t('saved.backupNever');
    } else {
      const days = Math.floor((Date.now() - at) / 86400000);
      ageEl.textContent = days <= 0 ? t('saved.backupToday') : t('saved.backupDays', { n: days });
    }
  }
  const nudge = $('#backup-nudge');
  if (nudge) {
    const at = typeof lastBackupAt === 'function' ? lastBackupAt() : 0;
    const stale = !at || (Date.now() - at) > 7 * 86400000;
    nudge.classList.toggle('hidden', !(stale && mode !== 'granted'));
  }
}

function renderStorageMeter() {
  const fill = $('#sm-fill');
  const text = $('#sm-usage');
  if (!fill || !text) return;
  const used = storageUsageChars();
  const pct = Math.min(100, Math.round(used / STORAGE_BUDGET * 100));
  fill.style.width = pct + '%';
  fill.dataset.level = pct >= 90 ? 'full' : pct >= 70 ? 'high' : 'ok';
  updateImageNote();
  text.textContent = t('saved.usage', {
    used: fmtSize(used), total: fmtSize(STORAGE_BUDGET), n: listSnapshots().length,
  });
}

function renderSavedList() {
  const snaps = listSnapshots();
  $('#saved-list').innerHTML = snaps.length
    ? snaps.map(savedItemHtml).join('')
    : '<p class="empty-note">' + t('saved.empty') + '</p>';
  renderStorageMeter();
  updateSavedCount();
}

let savedPanelReturn = null;

let releaseSavedTrap = null;

function openSavedPanel() {
  savedPanelReturn = document.activeElement;
  $('#saved-panel').classList.add('open');
  $('#scrim').classList.remove('hidden');
  renderSavedList();
  $('#save-name').value = state.meta.name || '';
  $('#save-name').focus();
  if (!releaseSavedTrap) releaseSavedTrap = trapInPanel($('#saved-panel'), closeSavedPanel);
}

function closeSavedPanel() {
  const panel = $('#saved-panel');
  panel.classList.remove('open');
  $('#scrim').classList.add('hidden');
  if (releaseSavedTrap) { releaseSavedTrap(); releaseSavedTrap = null; }
  const back = savedPanelReturn;
  savedPanelReturn = null;
  if (back && back.isConnected && back.getClientRects().length > 0) back.focus();
  else if (document.activeElement && panel.contains(document.activeElement)) {
    const main = $('#main');
    if (main) main.focus();
  }
}

async function doSaveSnapshot() {
  await packCurrentImages();
  if (typeof requestPersistence === 'function') {
    await requestPersistence();
    updateImageNote();
  }
  const name = $('#save-name').value.trim() || state.meta.name || 'Signature';
  const snap = saveSnapshot(state, name);
  if (!snap) {
    showToast(t('toast.saveFail'), 'err', { key: 'toast.saveFail' });
    return;
  }
  state.meta.name = name;
  renderSavedList();
  showToast(t('toast.saved', { name }), '', { key: 'toast.saved', params: { name } });
}

/* Open-Xchange (mailbox.org) keeps a separate signature for replies and
   forwards, per sending address. Save a paired copy without disturbing the
   signature currently being edited. */
async function doSaveReplyVariant() {
  await packCurrentImages();
  const typed = ($('#save-name') && $('#save-name').value.trim()) || '';
  const base = typed || state.meta.name || (state.profile && state.profile.name) || 'Signature';
  const name = `${base} — Reply`;
  const copy = JSON.parse(JSON.stringify(state));
  copy.design.template = 'reply';
  copy.meta.name = name;
  const snap = saveSnapshot(copy, name);
  if (!snap) {
    showToast(t('toast.saveFail'), 'err', { key: 'toast.saveFail' });
    return;
  }
  renderSavedList();
  showToast(t('toast.replyVariantSaved', { name }), '', {
    key: 'toast.replyVariantSaved',
    params: { name },
  });
}

/* ── image uploads ────────────────────────────────────────────────────── */

/* The last ORIGINAL (uncropped) upload per field, kept in memory for the
   re-crop modal. Not persisted — originals can be large. */
const logoOriginals = {};

/* Centre-crop an image to a square and return a data URL. Falls back to
   JPEG when the PNG would exceed the size guard. align: center|left|right
   picks which side of a wide image the square is taken from. */
function cropToSquare(img, maxBytes = 512 * 1024, align = 'center') {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) return null;
  const room = img.naturalWidth - side;
  const sx = align === 'left' ? 0 : align === 'right' ? room : room / 2;
  const sy = (img.naturalHeight - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
  let url = canvas.toDataURL('image/png');
  if (url.length > maxBytes) url = canvas.toDataURL('image/jpeg', 0.92);
  return url;
}

/* ── re-crop modal ────────────────────────────────────────────────────── */

let recropImg = null;

function openRecrop() {
  if (!logoOriginals['design.logoUrl']) {
    showToast(t('toast.recropNeedsUpload'), 'err', { key: 'toast.recropNeedsUpload' });
    return;
  }
  recropImg = new Image();
  recropImg.onload = () => {
    const canvas = $('#recrop-canvas');
    const scale = Math.min(220 / recropImg.naturalWidth, 220 / recropImg.naturalHeight, 1);
    canvas.width = Math.round(recropImg.naturalWidth * scale);
    canvas.height = Math.round(recropImg.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(recropImg, 0, 0, canvas.width, canvas.height);
    openOverlay('#modal-recrop');
  };
  recropImg.onerror = () => showToast(t('toast.recropLoadFail'), 'err', { key: 'toast.recropLoadFail' });
  recropImg.src = logoOriginals['design.logoUrl'];
}

function applyRecrop() {
  if (!recropImg || !logoOriginals['design.logoUrl']) return;
  const align = $('#recrop-align').value;
  const url = cropToSquare(recropImg, 512 * 1024, align) || logoOriginals['design.logoUrl'];
  setPath(state, 'design.logoUrl', url);
  const el = document.querySelector('[data-field="design.logoUrl"]');
  if (el) el.value = url;
  closeOverlay('#modal-recrop');
  renderPreview();
  scheduleSave();
  showToast(t('toast.recropped', { align: t('recrop.alignValue.' + align) }), '',
    { key: 'toast.recropped', params: { align: t('recrop.alignValue.' + align) } });
}

/* Bytes → data URL (chunked: big images blow the arg limit otherwise). */
function dataUrlFromBytes(bytes, mime) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/* Upload target: 2× the display size so retina screens stay crisp while a
   phone photo still shrinks by an order of magnitude. */
function uploadTargetWidth(fieldPath) {
  if (fieldPath === 'design.bannerUrl') return 600;
  if (fieldPath.startsWith('design.footer')) return 192;
  const w = Number(state.design.logoWidth) || 72;
  return Math.min(320, Math.max(64, w * 2));
}

function fmtKB(n) {
  return n < 1024 ? `${Math.round(n)} B` : `${Math.round(n / 1024)} KB`;
}

async function optimiseUpload(dataUrl, fieldPath) {
  if (typeof optimizeImage !== 'function' || typeof dataUriBytes !== 'function') {
    return { url: dataUrl, before: 0, after: 0 };
  }
  try {
    const before = dataUriBytes(dataUrl);
    const opt = await optimizeImage(dataUrl, uploadTargetWidth(fieldPath));
    if (!opt) return { url: dataUrl, before, after: before };
    const after = opt.bytes.length;
    if (after >= before) return { url: dataUrl, before, after: before };
    return { url: dataUrlFromBytes(opt.bytes, opt.mime), before, after };
  } catch (e) {
    return { url: dataUrl, before: 0, after: 0 };
  }
}

function bindImageUpload(btnId, fileId, fieldPath, { square = false } = {}) {
  $(btnId).addEventListener('click', () => $(fileId).click());
  $(fileId).addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    /* Reading a huge file is the real limit — size is handled by
       downscaling below, so accepted uploads no longer dead-end. */
    if (file.size > 8 * 1024 * 1024) {
      showToast(t('toast.imageTooLarge'), 'err', { key: 'toast.imageTooLarge' });
      return;
    }
    const reader = new FileReader();
    const applyUrl = (url, opt) => {
      setPath(state, fieldPath, url);
      const el = document.querySelector(`[data-field="${fieldPath}"]`);
      if (el) el.value = url;
      renderPreview();
      scheduleSave();
      if (opt && opt.after && opt.after < opt.before) {
        showToast(t('toast.imageOptimised', { before: fmtKB(opt.before), after: fmtKB(opt.after) }),
          '', { key: 'toast.imageOptimised', params: { before: fmtKB(opt.before), after: fmtKB(opt.after) } });
      } else {
        showToast(t('toast.embeddedImage'), 'warn', { key: 'toast.embeddedImage' });
      }
    };
    reader.onload = async () => {
      let url = reader.result;
      if (square) {
        /* Square crop for logos/avatars: portrait photos would otherwise
           be stretched into the square slot. Keep the original in memory
           for the re-crop modal. */
        logoOriginals[fieldPath] = url;
        url = await new Promise(res => {
          const img = new Image();
          img.onload = () => res(cropToSquare(img) || url);
          img.onerror = () => res(url);
          img.src = url;
        });
      }
      const opt = await optimiseUpload(url, fieldPath);
      applyUrl(opt.url, opt);
    };
    reader.readAsDataURL(file);
  });
}

/* ── simple / advanced editor mode ────────────────────────────────────── */

/* Simple mode hides every [data-advanced] control (expert sections,
   fine-tuning, power tools) via CSS — state is never touched, so
   switching back restores everything exactly. */
const MODE_KEY = 'sigstudio.mode';
/* Kept in sync with package.json and sw.js on every release. */
const APP_VERSION = '0.101.0';
let editorMode = 'simple';

function draftHasAdvanced(d) {
  if (!d) return false;
  const s = d.design || {};
  return Boolean(
    String(s.customHtml || '').trim() ||
    String(s.supportChatUrl || '').trim() ||
    String(s.supportTitle || '').trim() ||
    String(s.footerLeftImg || '').trim() ||
    String(s.footerCenterImg || '').trim() ||
    String(s.footerRightImg || '').trim() ||
    String(s.rowGap ?? '').trim() || String(s.cellPad ?? '').trim() ||
    String(s.lineHeight ?? '').trim() || String(s.textAlign ?? '').trim() ||
    String(s.linkColor || '').trim() || String(s.nameColor || '').trim() ||
    String(s.customFont || '').trim() ||
    (Array.isArray(s.blockOrder) && s.blockOrder.join(',') !== DEFAULT_BLOCK_ORDER.join(','))
  );
}

function applyMode() {
  document.documentElement.classList.toggle('mode-simple', editorMode === 'simple');
  const s = $('#mode-simple');
  const a = $('#mode-advanced');
  if (s) s.setAttribute('aria-pressed', String(editorMode === 'simple'));
  if (a) a.setAttribute('aria-pressed', String(editorMode === 'advanced'));
}

function setMode(m) {
  editorMode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
  applyMode();
}

function initMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'simple' || stored === 'advanced') {
      editorMode = stored;
    } else {
      /* No preference: existing advanced content keeps its user in
         Advanced; everyone else starts Simple. */
      editorMode = draftHasAdvanced(loadDraft()) ? 'advanced' : 'simple';
    }
  } catch (e) { editorMode = 'simple'; }
  applyMode();
  $('#mode-simple').addEventListener('click', () => setMode('simple'));
  $('#mode-advanced').addEventListener('click', () => setMode('advanced'));
}

/* "Update available" pill: a new service worker is installed and waiting. */
function showUpdatePill() {
  $('#update-pill').classList.remove('hidden');
}

/* Ask the waiting worker to activate, then reload onto the new version.
   The timeout is a fallback for browsers that never fire controllerchange
   (the worker itself may be gone by then). */
function activateWaiting(worker) {
  reloadOnControl = true;
  try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) { /* gone */ }
  setTimeout(() => location.reload(), 1500);
}

/* Manual-copy fallback: the browser blocked the clipboard API. Show the
   payload in a read-only textarea, pre-selected, so Ctrl+C just works. */
function showManualCopy(payload) {
  const ta = $('#manual-copy-text');
  if (!ta) return;
  ta.value = payload;
  openOverlay('#modal-manual-copy');
  setTimeout(() => {
    ta.focus();
    ta.select();
  }, 30);
}

/* ── init ─────────────────────────────────────────────────────────────── */

function init() {
  const verEl = $('#app-version');
  if (verEl) verEl.textContent = t('footer.version', { v: APP_VERSION });
  state = normalizeLoadedState(loadDraft());
  /* Images live in IndexedDB; resolve refs before the first real render.
     The promise is exposed so the E2E helper can wait for it. */
  window.__imagesReadyDone = false;
  window.__imagesReady = hydrateStateImages(state)
    .then(() => packCurrentImages())
    .then(() => { window.__imagesReadyDone = true; })
    .catch(() => { window.__imagesReadyDone = true; });

  /* Shared-signature links (?sig=…): decode now, decide at the end of init
     — replacing the user's own signature must be a choice, not a side
     effect. */
  let sigBootStatus = 'none';
  let sharedState = null;
  try {
    const sigParam = new URLSearchParams(location.search).get('sig');
    if (sigParam) {
      const raw = lzwDecode(sigParam);
      if (!raw) throw new Error('decode');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.design || !parsed.profile) throw new Error('shape');
      sharedState = normalizeLoadedState(parsed);
      localStorage.setItem(WIZARD_DONE_KEY, '1');
      sigBootStatus = 'loaded';
    }
  } catch (e) {
    if (new URLSearchParams(location.search).has('sig')) sigBootStatus = 'bad';
  }

  initTemplatePicker();
  initContactOrder();
  initStatusPresets();
  initSectionJump();

  document.addEventListener('input', onFieldInput);
  document.addEventListener('change', onFieldInput);

  /* undo/redo */
  $('#btn-undo').addEventListener('click', doUndo);
  $('#btn-redo').addEventListener('click', doRedo);
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.closest('input, textarea, select') || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
  });

  /* socials */
  const socialsList = $('#socials-list');
  socialsList.addEventListener('input', onSocialListInput);
  socialsList.addEventListener('change', onSocialListInput);
  socialsList.addEventListener('click', onSocialListClick);
  bindDragDrop(socialsList, 'socials');
  $('#add-social').addEventListener('click', () => addSocial('linkedin'));
  $('#quick-socials').addEventListener('click', e => {
    const b = e.target.closest('.chip-btn');
    if (b) addSocial(b.dataset.net);
  });

  /* custom lines */
  const customList = $('#custom-list');
  customList.addEventListener('input', onCustomListInput);
  customList.addEventListener('click', onCustomListClick);
  bindDragDrop(customList, 'customs');
  $('#add-custom').addEventListener('click', () => {
    pushHistory('undo.addLine');
    state.customLines.push({ label: '', value: '' });
    renderCustoms();
    scheduleSave();
  });
  $('#add-custom-hours').addEventListener('click', () => {
    pushHistory('undo.addLine');
    state.customLines.push({ label: t('customs.officeHoursLabel'), value: 'Mon–Fri, 9:00–17:00' });
    renderCustoms();
    scheduleSave();
    const sec = document.querySelector('details[data-sec="customs"]');
    if (sec && !sec.open) sec.open = true;
    showToast(t('customs.officeHoursToast'), '', { key: 'customs.officeHoursToast' });
  });

  /* templates */
  $('#tpl-picker').addEventListener('click', e => {
    const b = e.target.closest('.tpl-btn');
    if (!b) return;
    pushHistory();
    state.design.template = b.dataset.template;
    updateTemplatePicker();
    renderPreview();
    scheduleSave();
  });

  /* colour themes */
  $('#themes-row').addEventListener('click', onThemeClick);

  /* wizard + quick-switch */
  initWizard();
  initQuickSwitch();
  initTour();

  /* preview chrome */
  $('#seg-width').addEventListener('change', e => {
    if (e.target.name === 'prevWidth' && e.target.checked) {
      $('#preview-frame').style.maxWidth = e.target.value + 'px';
      /* The media-query layout changes with viewport width but srcdoc does
         not re-load, so re-sync the iframe height manually. */
      syncPreviewHeight();
    }
  });
  $('#seg-bg').addEventListener('change', e => {
    if (e.target.name === 'prevBg' && e.target.checked) {
      const stage = $('#stage');
      stage.classList.remove('grey', 'dark');
      if (e.target.value !== 'white') stage.classList.add(e.target.value);
    }
  });

  /* trust badge: jump to the checklist (unfolding its section, if any) */
  $('#trust-badge').addEventListener('click', () => {
    const list = $('#checklist');
    const host = list && list.closest('details[data-sec]');
    if (host) host.open = true;
    if (list) {
      list.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      list.focus({ preventScroll: true });
    }
  });

  /* empty-state guide: straight to the one field that matters */
  const guideExample = $('#empty-guide-example');
  if (guideExample) guideExample.addEventListener('click', () => {
    pushHistory('undo.sample');
    const persona = SAMPLE_PERSONAS[0];
    state = sampleState(persona.id);
    rebuildAll();
    scheduleSave();
    showToast(t('toast.sample', { name: persona.name }), '', { key: 'toast.sample', params: { name: persona.name } });
  });
  $('#empty-guide-btn').addEventListener('click', () => {
    const sec = document.querySelector('details[data-sec="profile"]');
    if (sec) sec.open = true;
    const nameField = document.querySelector('[data-field="profile.name"]');
    if (nameField) nameField.focus();
  });
  $('#preview-frame').addEventListener('load', syncPreviewHeight);

  function syncPreviewHeight() {
    try {
      const doc = $('#preview-frame').contentDocument;
      $('#preview-frame').style.height = (doc.body.scrollHeight + 4) + 'px';
    } catch (e) { /* cross-origin: ignore */ }
  }

  /* topbar */
  let sampleIdx = 0;
  $('#btn-sample').addEventListener('click', () => {
    pushHistory('undo.sample');
    const persona = SAMPLE_PERSONAS[sampleIdx % SAMPLE_PERSONAS.length];
    state = sampleState(persona.id);
    sampleIdx++;
    rebuildAll();
    scheduleSave();
    showToast(t('toast.sample', { name: persona.name }), '', { key: 'toast.sample', params: { name: persona.name } });
  });
  $('#btn-import').addEventListener('click', () => {
    openOverlay('#modal-import'); /* focus lands on #import-src via data-autofocus */
    $('#import-summary').classList.add('hidden');
    $('#import-apply-row').classList.add('hidden');
    lastParsedImport = null;
  });
  /* Import mode switch: HTML vs vCard. */
  document.querySelectorAll('input[name="importMode"]').forEach(r => r.addEventListener('change', () => {
    const vcard = document.querySelector('input[name="importMode"]:checked').value === 'vcard';
    $('#import-hint').textContent = vcard ? t('import.hintVcard') : t('import.hint');
    $('#btn-vcard-file').classList.toggle('hidden', !vcard);
    $('#import-src').placeholder = vcard ? 'BEGIN:VCARD…' : '<table>…</table> or a full HTML document';
    lastParsedImport = null;
    $('#import-summary').classList.add('hidden');
    $('#import-apply-row').classList.add('hidden');
  }));
  $('#btn-vcard-file').addEventListener('click', () => $('#vcard-file').click());
  $('#vcard-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { $('#import-src').value = reader.result; doVCardParse(); };
    reader.readAsText(file);
  });
  $('#btn-saved').addEventListener('click', openSavedPanel);
  $('#btn-shortcuts').addEventListener('click', () => openOverlay('#modal-shortcuts'));
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (el && (el.closest('input, textarea, select') || el.isContentEditable)) return;
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.overlay:not(.hidden)')) return;
    e.preventDefault();
    openOverlay('#modal-shortcuts');
  });
  $('#saved-cleanup').addEventListener('click', () => {
    const snaps = listSnapshots().slice().sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
    const target = STORAGE_BUDGET * 0.7;
    let removed = 0;
    /* Keep at least one snapshot: "free space" must not become "lose
       everything". If the budget is still tight afterwards, the meter says
       so and the user can export and delete deliberately. */
    while (snaps.length > 1 && storageUsageChars() > target) {
      const oldest = snaps.shift();
      deleteSnapshot(oldest.id);
      removed += 1;
    }
    renderSavedList();
    showToast(t(removed ? 'saved.cleaned' : 'saved.nothingToClean', { n: removed }), '',
      { key: removed ? 'saved.cleaned' : 'saved.nothingToClean', params: { n: removed } });
  });
  $('#btn-reset').addEventListener('click', () => {
    showConfirm(t('confirm.startOverTitle'), t('confirm.startOverBody'), () => {
      pushHistory('undo.startOver');
      state = defaultState();
      clearDraft();
      rebuildAll();
      showToast(t('toast.freshStart'), '', { key: 'toast.freshStart' });
    });
  });

  /* export menu */
  const menu = $('#export-menu');
  $('#btn-export').addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (willOpen) updateExportNotes();
  });
  $('#backup-now').addEventListener('click', () => { doBackup(); });
  $('#x-backup').addEventListener('click', () => {
    menu.classList.add('hidden');
    doBackup();
  });
  $('#x-restore').addEventListener('click', () => {
    menu.classList.add('hidden');
    $('#restore-file').click();
  });
  $('#restore-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) beginRestore(file);
  });
  $('#restore-merge').addEventListener('click', () => applyRestore('merge'));
  $('#restore-replace').addEventListener('click', () => applyRestore('replace'));
  $('#x-receiver-guide').addEventListener('click', () => {
    menu.classList.add('hidden');
    openOverlay('#modal-receiver-guide');
  });
  $('#variant-compact').addEventListener('change', e => {
    state.design.density = e.target.checked ? 'compact' : 'regular';
    const select = document.querySelector('[data-field="design.density"]');
    if (select) select.value = state.design.density;
    renderPreview();
    scheduleSave();
  });
  $('#x-compat').addEventListener('click', () => {
    menu.classList.add('hidden');
    openCompat(null);
  });
  $('#compat-continue').addEventListener('click', () => {
    const fn = pendingCompat;
    pendingCompat = null;
    closeOverlay('#modal-compat');
    if (fn) fn();
  });
  $('#x-asset-pack').addEventListener('click', () => {
    menu.classList.add('hidden');
    doAssetPack();
  });
  $('#x-bimi-svg').addEventListener('click', () => {
    menu.classList.add('hidden');
    doBimiSvg();
  });
  $('#x-bimi').addEventListener('click', () => {
    menu.classList.add('hidden');
    openBimi();
  });
  $('#bimi-check').addEventListener('click', () => { runBimiCheck(); });
  $('#bimi-copy').addEventListener('click', () => { copyBimiRecord(); });
  $('#bimi-domain').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runBimiCheck();
    }
  });
  $('#x-plain').addEventListener('click', () => {
    menu.classList.add('hidden');
    doPlainText();
  });
  $('#x-sender-copy').addEventListener('click', async () => {
    const text = senderIdentity();
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('toast.senderCopied'), '', { key: 'toast.senderCopied' });
    } catch (e) {
      showToast(t('toast.copyFail'), 'err', { key: 'toast.copyFail' });
    }
  });

  /* Keyboard shortcuts: Ctrl+Enter copies, Ctrl+Shift+E opens the export
     menu. Both work from anywhere in the editor. */
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') {
      e.preventDefault();
      guardOutlookExport(() => doCopy());
      return;
    }
    if (k === 'e' && e.shiftKey) {
      e.preventDefault();
      document.getElementById('btn-export').click();
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.export-wrap')) menu.classList.add('hidden');
  });
  $('#x-copy').addEventListener('click', () => { menu.classList.add('hidden'); guardOutlookExport(() => doCopy()); });
  $('#x-copy-fragment').addEventListener('click', () => { menu.classList.add('hidden'); doCopyFragment(); });
  $('#x-apple-mail').addEventListener('click', () => {
    menu.classList.add('hidden');
    downloadRawFile(appleMailSignature(state), `${slugify(state.meta.name)}.mailsignature`, 'text/html');
    showToast(t('toast.appleMail'), 'ok', { key: 'toast.appleMail' });
  });
  $('#x-thunderbird').addEventListener('click', () => {
    menu.classList.add('hidden');
    downloadRawFile(thunderbirdSignature(state), `${slugify(state.meta.name)}-thunderbird.html`, 'text/html');
    showToast(t('toast.thunderbird'), 'ok', { key: 'toast.thunderbird' });
  });
  $('#x-outlook-pack').addEventListener('click', () => { menu.classList.add('hidden'); doOutlookPack(); });
  $('#x-share').addEventListener('click', () => { menu.classList.add('hidden'); doShareLink(); });
  $('#x-share-full').addEventListener('click', () => { menu.classList.add('hidden'); doShareLink({ forceFull: true }); });
  $('#x-share-qr').addEventListener('click', () => { menu.classList.add('hidden'); doShowShareQR(); });
  $('#x-json').addEventListener('click', () => { menu.classList.add('hidden'); openJsonEditor(); });
  $('#x-instructions').addEventListener('click', () => { menu.classList.add('hidden'); openOverlay('#modal-instructions'); });
  $('#x-test').addEventListener('click', () => { menu.classList.add('hidden'); openTestModal(); });
  $('#test-download').addEventListener('click', () => { doDownloadTestEml(); });
  $('#test-copy').addEventListener('click', () => { doCopyTestChecklist(); });
  $('#bimi-domain').addEventListener('input', updateBimiDomainHint);
  /* Copy from inside the instructions: one place to read the steps and
     grab the signature (no bouncing back to the export menu). */
  const instrCopy = $('#instr-copy');
  if (instrCopy) instrCopy.addEventListener('click', () => doCopy());
  $('#x-audit').addEventListener('click', () => { menu.classList.add('hidden'); openAudit(); });
  $('#x-bulk').addEventListener('click', () => { menu.classList.add('hidden'); openBulk(); });
  $('#x-cid-zip').addEventListener('click', () => { menu.classList.add('hidden'); doCidZip(); });
  $('#bulk-generate').addEventListener('click', runBulk);
  $('#bulk-vcards').addEventListener('click', () => { doContactCardsZip(); });
  let bulkPreviewTimer = 0;
  $('#bulk-csv').addEventListener('input', () => {
    clearTimeout(bulkPreviewTimer);
    bulkPreviewTimer = setTimeout(renderBulkPreview, 200);
  });
  $('#audit-download').addEventListener('click', downloadAudit);
  $('#json-apply').addEventListener('click', applyJsonEditor);
  $('#x-download').addEventListener('click', () => {
    menu.classList.add('hidden');
    guardOutlookExport(() => {
      downloadSignature(renderSignature(state), state.meta.name);
      showToast(t('toast.downloading'), '', { key: 'toast.downloading' });
    });
  });
  $('#x-instructions').addEventListener('click', () => {
    menu.classList.add('hidden');
    openOverlay('#modal-instructions');
  });
  $('#x-preset-export').addEventListener('click', () => { menu.classList.add('hidden'); doExportPreset(); });
  $('#x-preset-import').addEventListener('click', () => { menu.classList.add('hidden'); $('#preset-file').click(); });
  $('#x-vcard').addEventListener('click', () => { menu.classList.add('hidden'); doVCard(); });
  $('#x-vcard4').addEventListener('click', () => { menu.classList.add('hidden'); doVCard4(); });
  $('#x-qr').addEventListener('click', () => { menu.classList.add('hidden'); doShowQR(); });

  /* preset file input */
  $('#preset-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) doImportPresetFile(file);
  });

  /* instructions tabs */
  $('#instr-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.itab');
    if (!tab) return;
    document.querySelectorAll('.itab').forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-pressed', String(t === tab));
    });
    document.querySelectorAll('.ipane').forEach(p =>
      p.classList.toggle('active', p.id === 'pane-' + tab.dataset.tab));
  });

  /* import */
  $('#import-parse').addEventListener('click', doImportParse);
  $('#import-src').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doImportParse();
  });
  $('#import-apply').addEventListener('click', doImportApply);
  $('#import-eml').addEventListener('click', () => $('#eml-file').click());
  $('#eml-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) importEmlFile(file);
  });

  /* saved panel */
  $('#saved-close').addEventListener('click', closeSavedPanel);
  $('#scrim').addEventListener('click', closeSavedPanel);
  $('#save-now').addEventListener('click', doSaveSnapshot);
  $('#save-reply').addEventListener('click', doSaveReplyVariant);
  $('#save-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSaveSnapshot();
  });
  $('#saved-list').addEventListener('click', async e => {
    const item = e.target.closest('.saved-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.classList.contains('snap-load')) {
      const loaded = await loadSnapshotHydrated(id);
      if (loaded) {
        pushHistory();
        state = normalizeLoadedState(loaded);
        closeSavedPanel();
        rebuildAll();
        scheduleSave();
        showToast(t('toast.loaded'), '', { key: 'toast.loaded' });
      }
    } else if (e.target.classList.contains('snap-default')) {
      const isDefault = defaultSnapId() === id;
      setDefaultSnap(isDefault ? '' : id);
      renderSavedList();
      const again = document.querySelector(`.saved-item[data-id="${id}"] .snap-default`);
      if (again) again.focus();
      showToast(t(isDefault ? 'saved.defaultCleared' : 'saved.defaultSet'), '', { key: 'toast.default' });
    } else if (e.target.classList.contains('snap-del')) {
      /* Keep the keyboard user in the list: focus the same row's Load
         button after the re-render (or the last row if it was the end). */
      const rows = [...document.querySelectorAll('#saved-list .saved-item')];
      const idx = Math.max(0, rows.indexOf(e.target.closest('.saved-item')));
      deleteSnapshot(id);
      if (typeof gcImages === 'function') gcImages(historyImageIds());
      renderSavedList();
      showToast(t('toast.deleted'), '', { key: 'toast.deleted' });
      const after = [...document.querySelectorAll('#saved-list .saved-item')];
      const target = after[idx] || after[after.length - 1];
      const btn = target && (target.querySelector('.snap-load') || target.querySelector('.snap-del'));
      (btn || $('#save-name')).focus();
    }
  });

  $('#outlook-anyway').addEventListener('click', () => {
    closeOverlay('#modal-outlook');
    const fn = pendingExport;
    pendingExport = null;
    if (fn) fn();
  });
  $('#outlook-strict').addEventListener('click', () => {
    closeOverlay('#modal-outlook');
    state.design.strictOutlook = true;
    const cb = document.querySelector('[data-field="design.strictOutlook"]');
    if (cb) cb.checked = true;
    rebuildAll();
    scheduleSave();
    const fn = pendingExport;
    pendingExport = null;
    if (fn) fn();
    showToast(t('toast.strictExport'), '', { key: 'toast.strictExport' });
  });
  $('#modal-outlook [data-close]').addEventListener('click', () => { pendingExport = null; });

  /* generic close buttons + Esc: route through closeOverlay so focus is
     restored to whatever opened the dialog. */
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => {
      const overlay = b.closest('.overlay');
      if (overlay && overlay.id) closeOverlay('#' + overlay.id);
    }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#saved-panel').classList.contains('open')) closeSavedPanel();
    document.querySelectorAll('.overlay:not(.hidden)').forEach(o => closeOverlay('#' + o.id));
    menu.classList.add('hidden');
  });
  /* Focus trap: while a modal overlay is open, Tab and Shift+Tab cycle
     within it (APG dialog pattern; the background stays keyboard-inert). */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const ov = document.querySelector('.overlay:not(.hidden)');
    if (!ov) return;
    const focusables = getFocusables(ov);
    if (!focusables.length) { e.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !ov.contains(active)) { e.preventDefault(); last.focus(); }
    } else if (active === last || !ov.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  });

  /* editor section open/close state survives reloads */
  const SECTIONS_KEY = 'sigstudio.sections';
  /* Essentials-first: on a genuine first visit (no saved map yet) only
     Profile and Design start open — the rest unfolds on demand. Returning
     users (key present) are untouched. The open attributes are removed
     before the toggle listeners below exist, but browsers dispatch the
     toggle event asynchronously — the queued events land after the
     listeners are attached. programmaticClose marks each section so the
     listener ignores exactly that first queued event: the collapse is a
     fresh-visit default, not a recorded user choice. */
  let firstVisit = true;
  try { firstVisit = localStorage.getItem(SECTIONS_KEY) === null; } catch (e) { /* ignore */ }
  const programmaticClose = new WeakSet();
  if (firstVisit) {
    document.querySelectorAll('details[data-sec]').forEach(d => {
      if (d.dataset.sec !== 'profile') {
        programmaticClose.add(d);
        d.removeAttribute('open');
      }
    });
  }
  try {
    const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
    document.querySelectorAll('details[data-sec]').forEach(d => {
      const id = d.dataset.sec;
      if (saved[id] === false) d.open = false;
      d.addEventListener('toggle', () => {
        if (programmaticClose.has(d)) { programmaticClose.delete(d); return; }
        try {
          const cur = JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
          cur[id] = d.open;
          localStorage.setItem(SECTIONS_KEY, JSON.stringify(cur));
        } catch (e) { /* ignore */ }
        if (id === 'tpl' && d.open && thumbsNeedsRebuild) renderThumbs();
      });
    });
  } catch (e) { /* ignore */ }

  /* image uploads */
  bindImageUpload('#upload-logo', '#logo-file', 'design.logoUrl', { square: true });
  bindImageUpload('#upload-logo-dark', '#logo-dark-file', 'design.logoDarkUrl', { square: true });
  bindImageUpload('#upload-portrait', '#portrait-file', 'design.portraitUrl', { square: true });
  bindImageUpload('#upload-banner', '#banner-file', 'design.bannerUrl');
  bindImageUpload('#upload-footer-left', '#footer-left-file', 'design.footerLeftImg');
  bindImageUpload('#upload-footer-center', '#footer-center-file', 'design.footerCenterImg');
  bindImageUpload('#upload-footer-right', '#footer-right-file', 'design.footerRightImg');

  /* Settings search: filter as you type; Ctrl/Cmd+K focuses, Esc clears. */
  const ssearch = $('#settings-search');
  if (ssearch) {
    ssearch.addEventListener('input', applySettingsFilter);
    ssearch.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        ssearch.value = '';
        applySettingsFilter();
        ssearch.blur();
      }
    });
    /* Ctrl/Cmd+K is the browser's own "focus the address bar" shortcut in
       Chrome, Edge and Firefox — a page never sees it. Use "/" (when not
       already typing) or Ctrl/Cmd+Shift+K, which are actually reachable. */
    document.addEventListener('keydown', e => {
      const t = e.target;
      const typing = t && (t.closest('input, textarea, select') || t.isContentEditable);
      const chord = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || '').toLowerCase() === 'k';
      const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!chord && !slash) return;
      e.preventDefault();
      ssearch.focus();
      ssearch.select();
    });
  }
  window.addEventListener('message', e => {
    const m = e.data || {};
    if (m.__sigstudio !== 'edit') return;
    const frame = $('#preview-frame');
    if (e.origin !== location.origin) return;
    if (frame && e.source !== frame.contentWindow) return;
    revealControl(m.key);
  });

  /* Keep the template thumbnails scaled to their tiles on resize. */
  let thumbResizeRaf = 0;
  window.addEventListener('resize', () => {
    if (thumbResizeRaf) return;
    thumbResizeRaf = requestAnimationFrame(() => { thumbResizeRaf = 0; fitThumbs(); });
  });

  /* First-run hint: preview click-to-edit is otherwise hover-only. */
  const hint = $('#preview-hint');
  if (hint) {
    let seen = false;
    try { seen = localStorage.getItem('sigstudio.hint.click') === '1'; } catch (e) { /* ignore */ }
    if (!seen) hint.classList.remove('hidden');
    $('#preview-hint-close').addEventListener('click', () => {
      hint.classList.add('hidden');
      try { localStorage.setItem('sigstudio.hint.click', '1'); } catch (e) { /* ignore */ }
    });
  }

  /* Remote images in the preview (off = no requests to third-party hosts). */
  const remoteToggle = $('#remote-images');
  if (remoteToggle) {
    remoteToggle.checked = remoteImagesOn();
    remoteToggle.addEventListener('change', () => {
      try { localStorage.setItem('sigstudio.remoteImg', remoteToggle.checked ? '1' : '0'); } catch (e) { /* ignore */ }
      renderPreviewNow();
    });
  }

  /* Narrow-window preview peek: a live bottom sheet instead of scrolling
     back and forth between the editor and the preview. */
  const peekFab = $('#peek-fab');
  const peekSheet = $('#peek-sheet');
  if (peekFab && peekSheet) {
    const setPeek = open => {
      peekSheet.classList.toggle('hidden', !open);
      peekFab.setAttribute('aria-expanded', String(open));
      if (open) {
        peekSheet.querySelector('#peek-frame').srcdoc = $('#preview-frame').srcdoc;
        $('#peek-close').focus();
      } else {
        peekFab.focus();
      }
    };
    peekFab.addEventListener('click', () => setPeek(peekSheet.classList.contains('hidden')));
    $('#peek-close').addEventListener('click', () => setPeek(false));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !peekSheet.classList.contains('hidden')) setPeek(false);
    });
  }

  /* Checklist items jump to the control that fixes them. */
  const checklistEl = $('#checklist');
  if (checklistEl) {
    checklistEl.addEventListener('click', e => {
      const item = e.target.closest('[data-check-target]');
      if (!item) return;
      focusField(item.dataset.checkTarget);
    });
  }

  /* Inline visibility eyes: toggle the show/hide state from the field. */
  document.querySelectorAll('[data-eye]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.eye;
      const next = getPath(state, key) === false;
      setPath(state, key, next);
      const cb = document.querySelector(`input[data-field="${key}"]`);
      if (cb) cb.checked = next;
      renderPreview();
      scheduleSave();
    });
  });

  /* Per-section reset buttons. */
  document.querySelectorAll('.sec-reset').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation(); /* never toggle the section */
      resetSection(btn.dataset.resetSec);
    });
  });
  $('#recrop-btn').addEventListener('click', openRecrop);
  $('#recrop-apply').addEventListener('click', applyRecrop);

  /* PWA: register the service worker for offline use. An updated worker
     WAITS (sw.js no longer skipWaiting's); the pill offers to activate it,
     and only then does the page reload. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadOnControl) location.reload();
    });
    const offer = worker => {
      if (!worker || !navigator.serviceWorker.controller) return; /* first install */
      waitingWorker = worker;
      showUpdatePill();
    };
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        if (reg.waiting) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const fresh = reg.installing;
          if (!fresh) return;
          fresh.addEventListener('statechange', () => {
            if (fresh.state === 'installed') offer(fresh);
          });
        });
      }).catch(() => { /* non-fatal */ });
    });
  }
  $('#update-reload').addEventListener('click', () => {
    if (waitingWorker) activateWaiting(waitingWorker);
    else location.reload();
  });

  initMode();
  /* Screen-reader heading navigation: the ten section summaries stay
     disclosure buttons, but their titles also expose as h2-level headings. */
  document.querySelectorAll('details[data-sec] > summary > span[data-i18n]').forEach(el => {
    el.setAttribute('role', 'heading');
    el.setAttribute('aria-level', '2');
  });
  rebuildAll();
  updateUndoButtons();
  setSaveStatus('saved');
  consumeShareTarget();

  /* Report the outcome of a ?sig= share link. With work already open, the
     load is a confirmed, undoable action rather than a silent replacement. */
  if (sigBootStatus === 'loaded' && sharedState) {
    const applyShared = () => {
      pushHistory('undo.share');      /* the local draft stays one ↶ away */
      state = sharedState;
      rebuildAll();
      scheduleSave();
      showToast(t('share.loaded'), '', { key: 'share.loaded' });
    };
    if (!draftHasContent(loadDraft())) {
      applyShared();
    } else {
      /* Drop the parameter so a reload doesn't re-ask after a refusal. */
      history.replaceState({}, '', location.pathname);
      showConfirm(t('share.replaceTitle'), t('share.replaceBody'), applyShared);
    }
  } else if (sigBootStatus === 'bad') {
    showToast(t('share.bad'), 'err', { key: 'share.bad' });
  }
}

document.addEventListener('DOMContentLoaded', init);
