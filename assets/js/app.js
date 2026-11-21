/* Signature Studio — UI wiring. */
'use strict';

/* ── state ────────────────────────────────────────────────────────────── */

let state = null;
let lastParsedImport = null;
let lastSaveAt = 0;
let dragCtx = null; // { type: 'socials'|'customs', index }

const HISTORY_MAX = 50;
let undoStack = [];
let redoStack = [];

const $ = sel => document.querySelector(sel);

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
  return out;
}

/* ── history (undo/redo) ──────────────────────────────────────────────── */

function pushHistory() {
  undoStack.push(clone(state));
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(clone(state));
  state = undoStack.pop();
  rebuildAll();
  scheduleSave();
  updateUndoButtons();
  showToast(t('toast.undone'), '', { key: 'toast.undone' });
}

function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(clone(state));
  state = redoStack.pop();
  rebuildAll();
  scheduleSave();
  updateUndoButtons();
  showToast(t('toast.redone'), '', { key: 'toast.redone' });
}

function updateUndoButtons() {
  const u = $('#btn-undo');
  const r = $('#btn-redo');
  if (u) u.disabled = !undoStack.length;
  if (r) r.disabled = !redoStack.length;
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
    '<script>document.addEventListener("click",function(e){e.preventDefault();' +
    'var t=e.target,el=t&&t.closest?t.closest("[data-edit]"):null;' +
    'try{parent.postMessage({__sigstudio:"edit",key:el?el.getAttribute("data-edit"):""},"*");}catch(err){}' +
    '},true);<\/script>';
  const html = renderSignaturePreview(state).replace('</body>', previewScript + '</body>');
  frame.srcdoc = html;
  const peek = $('#peek-frame');
  if (peek && !$('#peek-sheet').classList.contains('hidden')) peek.srcdoc = html;
  applyFieldVisibility();
  applyTemplateDimming();
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

function renderThumbsNow() {
  thumbsNeedsRebuild = false;
  const thumbs = document.querySelectorAll('.tthumb');
  if (!thumbs.length) return;
  const base = clone(state);
  for (const iframe of thumbs) {
    const s = clone(base);
    s.design.template = iframe.dataset.tpl;
    const html = renderSignature(s).replace(/src="data:[^"]*"/g, 'src=""');
    iframe.srcdoc = html;
  }
}

/* Time-throttled autosave: at most one write per second, plus a flush on
   unload. No setTimeout — same background-throttling reason as above. */
function scheduleSave() {
  const now = Date.now();
  if (now - lastSaveAt < 1000) return;
  lastSaveAt = now;
  if (!saveDraft(state)) showToast(t('toast.autosaveFail'), 'warn', { key: 'toast.autosaveFail' });
}

function flushSave() {
  if (!saveDraft(state)) return;
  lastSaveAt = Date.now();
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
  pushHistory();
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
  pushHistory();
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
  renderSocials();
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
  renderCustoms();
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
  pushHistory();
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
  menu.innerHTML = snaps.slice(0, 6).map(snap => {
    const d = new Date(snap.savedAt);
    const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `<button role="menuitem" type="button" data-snap="${snap.id}">
      <span class="qs-name">${esc(snap.name)}</span>
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
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-snap]');
    if (!b) return;
    const loaded = loadSnapshot(b.dataset.snap);
    if (loaded) {
      pushHistory();
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
  pushHistory();
  const order = (state.design.blockOrder || DEFAULT_BLOCK_ORDER).slice();
  const [b] = order.splice(from, 1);
  order.splice(to, 0, b);
  state.design.blockOrder = order;
  renderBlockList();
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
  if (meta && meta.key) {
    toastEl.dataset.i18nKey = meta.key;
    if (meta.params) toastEl.dataset.i18nParams = JSON.stringify(meta.params);
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

/* Share link: compress the whole state into a URL. */
async function doShareLink() {
  const url = `${location.origin}${location.pathname}?sig=${lzwEncode(JSON.stringify(state))}`;
  const how = await copySignature(url, url);
  if (how === 'failed') {
    showToast(t('toast.clipboardBlocked'), 'err', { key: 'toast.clipboardBlocked' });
    showManualCopy(url);
  } else {
    showToast(t('share.copied'), 'ok', { key: 'share.copied' });
  }
}

function openBulk() {
  $('#bulk-result').textContent = '';
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

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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
      pushHistory();
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

/* ── vCard + QR ───────────────────────────────────────────────────────── */

function doVCard() {
  const vcf = buildVCard(state);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  downloadBlob(blob, `${slugify(state.meta.name)}.vcf`);
  showToast(t('toast.vcardDownloaded'), '', { key: 'toast.vcardDownloaded' });
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

function doShowQR() {
  const vcf = buildVCard(state);
  const canvas = $('#qr-canvas');
  if (typeof qrcode !== 'function') {
    showToast(t('toast.qrFailed'), 'err', { key: 'toast.qrFailed' });
    return;
  }
  const qr = qrcode(0, 'M');
  qr.addData(vcf);
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
  $('#qr-caption').textContent =
    t('qr.caption', { name: state.profile.name || state.meta.name || 'this contact' });
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
  lastParsedImport = p;
}

function doImportApply() {
  if (!lastParsedImport) return;
  const p = lastParsedImport;
  pushHistory();
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
  if (p.profile.name) state.profile.name = p.profile.name;
  if (p.profile.title) state.profile.title = p.profile.title;
  if (p.profile.department) state.profile.department = p.profile.department;
  if (p.contact.email) state.contact.email = p.contact.email;
  if (p.contact.phone) state.contact.phone = p.contact.phone;
  if (p.contact.mobile) state.contact.mobile = p.contact.mobile;
  if (p.contact.website) state.contact.website = p.contact.website;
  if (p.socials.length) state.socials = p.socials;
  if (p.design.logoUrl) state.design.logoUrl = p.design.logoUrl;
  if (p.design.bannerUrl) state.design.bannerUrl = p.design.bannerUrl;
  if (p.design.logoPosition) state.design.logoPosition = p.design.logoPosition;
  if (p.design.legalText) {
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
    </div>
    <div class="si-actions">
      <button class="btn btn-sm snap-load">${t('saved.load')}</button>
      <button class="btn btn-sm snap-del">${t('saved.delete')}</button>
    </div>
  </div>`;
}

function renderSavedList() {
  const snaps = listSnapshots();
  $('#saved-list').innerHTML = snaps.length
    ? snaps.map(savedItemHtml).join('')
    : '<p class="empty-note">' + t('saved.empty') + '</p>';
  updateSavedCount();
}

let savedPanelReturn = null;

function openSavedPanel() {
  savedPanelReturn = document.activeElement;
  $('#saved-panel').classList.add('open');
  $('#scrim').classList.remove('hidden');
  renderSavedList();
  $('#save-name').value = state.meta.name || '';
  $('#save-name').focus();
}

function closeSavedPanel() {
  const panel = $('#saved-panel');
  panel.classList.remove('open');
  $('#scrim').classList.add('hidden');
  const back = savedPanelReturn;
  savedPanelReturn = null;
  if (back && back.isConnected && back.getClientRects().length > 0) back.focus();
  else if (document.activeElement && panel.contains(document.activeElement)) {
    const main = $('#main');
    if (main) main.focus();
  }
}

function doSaveSnapshot() {
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
const APP_VERSION = '0.65.0';
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

/* "Update available" pill: a new service worker took over mid-session. */
function showUpdatePill() {
  $('#update-pill').classList.remove('hidden');
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

  /* Shared-signature links (?sig=…): load the state, skip the wizard. */
  let sigBootStatus = 'none';
  try {
    const sigParam = new URLSearchParams(location.search).get('sig');
    if (sigParam) {
      const raw = lzwDecode(sigParam);
      if (!raw) throw new Error('decode');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.design || !parsed.profile) throw new Error('shape');
      state = normalizeLoadedState(parsed);
      localStorage.setItem(WIZARD_DONE_KEY, '1');
      sigBootStatus = 'loaded';
    }
  } catch (e) {
    if (new URLSearchParams(location.search).has('sig')) sigBootStatus = 'bad';
  }

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
    pushHistory();
    state.customLines.push({ label: '', value: '' });
    renderCustoms();
    scheduleSave();
  });
  $('#add-custom-hours').addEventListener('click', () => {
    pushHistory();
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
    pushHistory();
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
    pushHistory();
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
  $('#btn-reset').addEventListener('click', () => {
    showConfirm(t('confirm.startOverTitle'), t('confirm.startOverBody'), () => {
      pushHistory();
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
    menu.classList.toggle('hidden');
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
  $('#x-share').addEventListener('click', () => { menu.classList.add('hidden'); doShareLink(); });
  $('#x-json').addEventListener('click', () => { menu.classList.add('hidden'); openJsonEditor(); });
  $('#x-instructions').addEventListener('click', () => { menu.classList.add('hidden'); openOverlay('#modal-instructions'); });
  /* Copy from inside the instructions: one place to read the steps and
     grab the signature (no bouncing back to the export menu). */
  const instrCopy = $('#instr-copy');
  if (instrCopy) instrCopy.addEventListener('click', () => doCopy());
  $('#x-audit').addEventListener('click', () => { menu.classList.add('hidden'); openAudit(); });
  $('#x-bulk').addEventListener('click', () => { menu.classList.add('hidden'); openBulk(); });
  $('#x-cid-zip').addEventListener('click', () => { menu.classList.add('hidden'); doCidZip(); });
  $('#bulk-generate').addEventListener('click', runBulk);
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

  /* saved panel */
  $('#saved-close').addEventListener('click', closeSavedPanel);
  $('#scrim').addEventListener('click', closeSavedPanel);
  $('#save-now').addEventListener('click', doSaveSnapshot);
  $('#save-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSaveSnapshot();
  });
  $('#saved-list').addEventListener('click', e => {
    const item = e.target.closest('.saved-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.classList.contains('snap-load')) {
      const loaded = loadSnapshot(id);
      if (loaded) {
        pushHistory();
        state = normalizeLoadedState(loaded);
        closeSavedPanel();
        rebuildAll();
        scheduleSave();
        showToast(t('toast.loaded'), '', { key: 'toast.loaded' });
      }
    } else if (e.target.classList.contains('snap-del')) {
      deleteSnapshot(id);
      renderSavedList();
      showToast(t('toast.deleted'), '', { key: 'toast.deleted' });
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
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'k') {
        e.preventDefault();
        ssearch.focus();
        ssearch.select();
      }
    });
  }
  window.addEventListener('message', e => {
    const m = e.data || {};
    if (m.__sigstudio === 'edit') revealControl(m.key);
  });

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

  /* PWA: register the service worker for offline use */
  if ('serviceWorker' in navigator) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      /* A NEW worker claimed this page: an update installed in the
         background. Only prompt when we already had a controller — the
         first activation on a fresh visit is not an update. */
      if (hadController) showUpdatePill();
      hadController = true;
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal */ });
    });
  }
  $('#update-reload').addEventListener('click', () => location.reload());

  initMode();
  rebuildAll();
  updateUndoButtons();

  /* Report the outcome of a ?sig= share link. */
  if (sigBootStatus === 'loaded') {
    scheduleSave();
    showToast(t('share.loaded'), 'ok', { key: 'share.loaded' });
  } else if (sigBootStatus === 'bad') {
    showToast(t('share.bad'), 'err', { key: 'share.bad' });
  }
}

document.addEventListener('DOMContentLoaded', init);
