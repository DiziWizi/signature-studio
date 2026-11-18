/* Signature Studio — UI wiring. */
'use strict';

/* ── state ────────────────────────────────────────────────────────────── */

let state = null;
let lastParsedImport = null;
let previewTimer = null;
let saveTimer = null;

const $ = sel => document.querySelector(sel);

function normalizeLoadedState(raw) {
  const def = defaultState();
  const out = Object.assign({}, def, raw || {});
  out.profile = Object.assign({}, def.profile, (raw || {}).profile || {});
  out.contact = Object.assign({}, def.contact, (raw || {}).contact || {});
  out.design = Object.assign({}, def.design, (raw || {}).design || {});
  out.meta = Object.assign({}, def.meta, (raw || {}).meta || {});
  if (!Array.isArray(out.socials)) out.socials = [];
  if (!Array.isArray(out.customLines)) out.customLines = [];
  return out;
}

/* ── preview ──────────────────────────────────────────────────────────── */

function renderPreview() {
  const frame = $('#preview-frame');
  const html = renderSignature(state).replace(
    '</body>',
    '<script>document.addEventListener("click",function(e){e.preventDefault();},true);<\/script></body>'
  );
  frame.srcdoc = html;
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 60);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!saveDraft(state)) showToast('Could not autosave — local storage is full or blocked.', 'warn');
  }, 400);
}

/* ── field binding ────────────────────────────────────────────────────── */

function onFieldInput(e) {
  const el = e.target;
  if (!el || !el.dataset || !el.dataset.field) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
  else if (el.type === 'number') v = el.value === '' ? '' : Number(el.value);
  else v = el.value;
  setPath(state, el.dataset.field, v);
  if (el.dataset.field === 'design.logoWidth') updateLogoWidthOut();
  schedulePreview();
  scheduleSave();
}

function updateLogoWidthOut() {
  $('#logo-width-out').textContent = `${state.design.logoWidth || 72} px`;
}

/* ── socials ──────────────────────────────────────────────────────────── */

function socialRowHtml(soc, i) {
  const net = networkById(soc.network);
  const options = NETWORKS.map(n =>
    `<option value="${n.id}"${n.id === soc.network ? ' selected' : ''}>${esc(n.name)}</option>`).join('');
  const isCustom = soc.network === 'custom';
  const extra = isCustom
    ? `<div class="soc-extra">
         <input type="text" class="soc-glyph" maxlength="3" placeholder="Glyph (1–3 chars)" value="${esc(soc.glyph || '')}">
         <input type="color" class="soc-color" value="${esc(soc.color || '#5b6472')}" title="Brand colour">
       </div>`
    : '';
  return `<div class="social-row" data-i="${i}">
    <select class="soc-net">${options}</select>
    <input type="text" class="soc-url" placeholder="${esc(net.placeholder || 'https://…')}" value="${esc(soc.url)}">
    <button class="row-btn soc-up" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
    <button class="row-btn soc-down" title="Move down" ${i === state.socials.length - 1 ? 'disabled' : ''}>▼</button>
    <button class="row-btn del soc-del" title="Remove">×</button>
    ${extra}
  </div>`;
}

function renderSocials() {
  const list = $('#socials-list');
  list.innerHTML = state.socials.map((s, i) => socialRowHtml(s, i)).join('') ||
    '<p class="hint">No social links yet — use the quick-add chips or the button below.</p>';
}

function addSocial(network = 'linkedin') {
  state.socials.push({ network, url: '', glyph: '', color: '' });
  renderSocials();
  schedulePreview();
  scheduleSave();
}

function onSocialListInput(e) {
  const row = e.target.closest('.social-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  const soc = state.socials[i];
  if (!soc) return;
  if (e.target.classList.contains('soc-net')) {
    soc.network = e.target.value;
    if (soc.network === 'custom' && !soc.glyph) soc.glyph = '↗';
    renderSocials();
  } else if (e.target.classList.contains('soc-url')) {
    soc.url = e.target.value;
  } else if (e.target.classList.contains('soc-glyph')) {
    soc.glyph = e.target.value;
  } else if (e.target.classList.contains('soc-color')) {
    soc.color = e.target.value;
  }
  schedulePreview();
  scheduleSave();
}

function onSocialListClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = btn.closest('.social-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  if (btn.classList.contains('soc-up') && i > 0) {
    [state.socials[i - 1], state.socials[i]] = [state.socials[i], state.socials[i - 1]];
  } else if (btn.classList.contains('soc-down') && i < state.socials.length - 1) {
    [state.socials[i], state.socials[i + 1]] = [state.socials[i + 1], state.socials[i]];
  } else if (btn.classList.contains('soc-del')) {
    state.socials.splice(i, 1);
  } else {
    return;
  }
  renderSocials();
  schedulePreview();
  scheduleSave();
}

/* ── custom lines ─────────────────────────────────────────────────────── */

function customRowHtml(line, i) {
  return `<div class="custom-row" data-i="${i}">
    <input type="text" class="line-label" placeholder="Label" value="${esc(line.label)}">
    <input type="text" class="line-value" placeholder="Value" value="${esc(line.value)}">
    <button class="row-btn line-up" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
    <button class="row-btn line-down" title="Move down" ${i === state.customLines.length - 1 ? 'disabled' : ''}>▼</button>
    <button class="row-btn del line-del" title="Remove">×</button>
  </div>`;
}

function renderCustoms() {
  const list = $('#custom-list');
  list.innerHTML = state.customLines.map((l, i) => customRowHtml(l, i)).join('');
}

function onCustomListInput(e) {
  const row = e.target.closest('.custom-row');
  if (!row) return;
  const line = state.customLines[Number(row.dataset.i)];
  if (!line) return;
  if (e.target.classList.contains('line-label')) line.label = e.target.value;
  else if (e.target.classList.contains('line-value')) line.value = e.target.value;
  schedulePreview();
  scheduleSave();
}

function onCustomListClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = btn.closest('.custom-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  if (btn.classList.contains('line-up') && i > 0) {
    [state.customLines[i - 1], state.customLines[i]] = [state.customLines[i], state.customLines[i - 1]];
  } else if (btn.classList.contains('line-down') && i < state.customLines.length - 1) {
    [state.customLines[i], state.customLines[i + 1]] = [state.customLines[i + 1], state.customLines[i]];
  } else if (btn.classList.contains('line-del')) {
    state.customLines.splice(i, 1);
  } else {
    return;
  }
  renderCustoms();
  schedulePreview();
  scheduleSave();
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
  updateSavedCount();
  renderPreview();
}

function updateTemplatePicker() {
  document.querySelectorAll('.tpl-btn').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.template === state.design.template));
  });
}

function updateSavedCount() {
  $('#saved-count').textContent = listSnapshots().length;
}

/* ── toasts ───────────────────────────────────────────────────────────── */

function showToast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ── modals & overlays ────────────────────────────────────────────────── */

function openOverlay(id) { $(id).classList.remove('hidden'); }
function closeOverlay(id) { $(id).classList.add('hidden'); }

function showConfirm(title, body, onOk) {
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  openOverlay('#modal-confirm');
  const ok = $('#confirm-ok');
  const handler = () => { ok.removeEventListener('click', handler); closeOverlay('#modal-confirm'); onOk(); };
  ok.addEventListener('click', handler);
}

/* ── export ───────────────────────────────────────────────────────────── */

async function doCopy() {
  const html = renderSignature(state);
  const plain = plainTextVersion(state);
  const how = await copySignature(html, plain);
  if (how === 'failed') {
    showToast('Clipboard blocked by the browser — use “Download .html” instead.', 'err');
  } else {
    showToast('Copied — paste into your mail client’s signature box.');
  }
}

/* ── import ───────────────────────────────────────────────────────────── */

function summarizeParsed(p) {
  const parts = [];
  if (p.profile.name) parts.push(`<b>Name:</b> ${esc(p.profile.name)}`);
  if (p.profile.title) parts.push(`<b>Title:</b> ${esc(p.profile.title)}`);
  if (p.profile.department) parts.push(`<b>Department:</b> ${esc(p.profile.department)}`);
  if (p.contact.email) parts.push(`<b>Email:</b> ${esc(p.contact.email)}`);
  if (p.contact.phone) parts.push(`<b>Phone:</b> ${esc(p.contact.phone)}`);
  if (p.contact.mobile) parts.push(`<b>Mobile:</b> ${esc(p.contact.mobile)}`);
  if (p.contact.website) parts.push(`<b>Website:</b> ${esc(p.contact.website)}`);
  if (p.socials.length) parts.push(`<b>Social links:</b> ${p.socials.map(x => esc(networkById(x.network).name)).join(', ')}`);
  if (p.design.logoUrl) parts.push(`<b>Logo:</b> found`);
  if (p.design.bannerUrl) parts.push(`<b>Banner:</b> found`);
  if (p.design.legalText) parts.push(`<b>Legal line:</b> found`);
  parts.push(...p.notes.map(n => `<i>${esc(n)}</i>`));
  return parts.join('<br>');
}

function doImportParse() {
  const raw = $('#import-src').value;
  const p = parseSignatureHTML(raw);
  const summary = $('#import-summary');
  const applyRow = $('#import-apply-row');
  const foundSomething = p.profile.name || p.contact.email || p.contact.phone || p.contact.website ||
    p.socials.length || p.design.logoUrl || p.design.legalText;
  if (!foundSomething) {
    summary.innerHTML = '<b>Couldn’t find anything</b> — is that really a signature’s HTML?';
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
  if (p.design.legalText) {
    state.design.showLegal = true;
    state.design.legalText = p.design.legalText;
  }
  closeOverlay('#modal-import');
  rebuildAll();
  scheduleSave();
  showToast('Imported — review the fields and preview before exporting.');
}

/* ── saved panel ──────────────────────────────────────────────────────── */

function savedItemHtml(snap) {
  return `<div class="saved-item" data-id="${snap.id}">
    <div>
      <div class="si-name">${esc(snap.name)}</div>
      <div class="si-date">${new Date(snap.savedAt).toLocaleString()}</div>
    </div>
    <div class="si-actions">
      <button class="btn btn-sm snap-load">Load</button>
      <button class="btn btn-sm snap-del">Delete</button>
    </div>
  </div>`;
}

function renderSavedList() {
  const snaps = listSnapshots();
  $('#saved-list').innerHTML = snaps.length
    ? snaps.map(savedItemHtml).join('')
    : '<p class="empty-note">Nothing saved yet.<br>Build a signature, give it a name, and save it here.</p>';
  updateSavedCount();
}

function openSavedPanel() {
  $('#saved-panel').classList.add('open');
  $('#scrim').classList.remove('hidden');
  renderSavedList();
  $('#save-name').value = state.meta.name || '';
}

function closeSavedPanel() {
  $('#saved-panel').classList.remove('open');
  $('#scrim').classList.add('hidden');
}

function doSaveSnapshot() {
  const name = $('#save-name').value.trim() || state.meta.name || 'Signature';
  const snap = saveSnapshot(state, name);
  if (!snap) {
    showToast('Could not save — local storage is full (large embedded images?).', 'err');
    return;
  }
  state.meta.name = name;
  renderSavedList();
  showToast(`Saved “${name}”.`);
}

/* ── image uploads ────────────────────────────────────────────────────── */

function bindImageUpload(btnId, fileId, fieldPath) {
  $(btnId).addEventListener('click', () => $(fileId).click());
  $(fileId).addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 512 * 1024) {
      showToast('Image too large for embedding (max 512 KB). Host it and paste a URL instead.', 'err');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPath(state, fieldPath, reader.result);
      const el = document.querySelector(`[data-field="${fieldPath}"]`);
      if (el) el.value = reader.result;
      schedulePreview();
      scheduleSave();
      showToast('Embedded image — most mail clients block these. Host it and paste a URL for reliability.', 'warn');
    };
    reader.readAsDataURL(file);
  });
}

/* ── init ─────────────────────────────────────────────────────────────── */

function init() {
  state = normalizeLoadedState(loadDraft());

  document.addEventListener('input', onFieldInput);
  document.addEventListener('change', onFieldInput);

  /* socials */
  const socialsList = $('#socials-list');
  socialsList.addEventListener('input', onSocialListInput);
  socialsList.addEventListener('change', onSocialListInput);
  socialsList.addEventListener('click', onSocialListClick);
  $('#add-social').addEventListener('click', () => addSocial('linkedin'));
  $('#quick-socials').addEventListener('click', e => {
    const b = e.target.closest('.chip-btn');
    if (b) addSocial(b.dataset.net);
  });

  /* custom lines */
  const customList = $('#custom-list');
  customList.addEventListener('input', onCustomListInput);
  customList.addEventListener('click', onCustomListClick);
  $('#add-custom').addEventListener('click', () => {
    state.customLines.push({ label: '', value: '' });
    renderCustoms();
    scheduleSave();
  });

  /* templates */
  $('#tpl-picker').addEventListener('click', e => {
    const b = e.target.closest('.tpl-btn');
    if (!b) return;
    state.design.template = b.dataset.template;
    updateTemplatePicker();
    schedulePreview();
    scheduleSave();
  });

  /* preview chrome */
  $('#seg-width').addEventListener('change', e => {
    if (e.target.name === 'prevWidth' && e.target.checked) {
      $('#preview-frame').style.maxWidth = e.target.value + 'px';
    }
  });
  $('#seg-bg').addEventListener('change', e => {
    if (e.target.name === 'prevBg' && e.target.checked) {
      const stage = $('#stage');
      stage.classList.remove('grey', 'dark');
      if (e.target.value !== 'white') stage.classList.add(e.target.value);
    }
  });
  $('#preview-frame').addEventListener('load', () => {
    try {
      const doc = $('#preview-frame').contentDocument;
      $('#preview-frame').style.height = (doc.body.scrollHeight + 4) + 'px';
    } catch (e) { /* cross-origin: ignore */ }
  });

  /* topbar */
  $('#btn-sample').addEventListener('click', () => {
    state = sampleState();
    rebuildAll();
    scheduleSave();
    showToast('Sample data loaded — make it yours.');
  });
  $('#btn-import').addEventListener('click', () => {
    openOverlay('#modal-import');
    $('#import-summary').classList.add('hidden');
    $('#import-apply-row').classList.add('hidden');
    lastParsedImport = null;
    setTimeout(() => $('#import-src').focus(), 50);
  });
  $('#btn-saved').addEventListener('click', openSavedPanel);
  $('#btn-reset').addEventListener('click', () => {
    showConfirm('Start over?', 'This clears the current signature and your autosaved draft. Saved snapshots in the “Saved” panel are kept.', () => {
      state = defaultState();
      clearDraft();
      rebuildAll();
      showToast('Fresh start.');
    });
  });

  /* export menu */
  const menu = $('#export-menu');
  $('#btn-export').addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.export-wrap')) menu.classList.add('hidden');
  });
  $('#x-copy').addEventListener('click', () => { menu.classList.add('hidden'); doCopy(); });
  $('#x-download').addEventListener('click', () => {
    menu.classList.add('hidden');
    downloadSignature(renderSignature(state), state.meta.name);
    showToast('Downloading .html file.');
  });
  $('#x-instructions').addEventListener('click', () => {
    menu.classList.add('hidden');
    openOverlay('#modal-instructions');
  });

  /* instructions tabs */
  $('#instr-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.itab');
    if (!tab) return;
    document.querySelectorAll('.itab').forEach(t => t.classList.toggle('active', t === tab));
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
        state = normalizeLoadedState(loaded);
        closeSavedPanel();
        rebuildAll();
        scheduleSave();
        showToast('Loaded.');
      }
    } else if (e.target.classList.contains('snap-del')) {
      deleteSnapshot(id);
      renderSavedList();
      showToast('Deleted.');
    }
  });

  /* generic close buttons + Esc */
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => {
      const overlay = b.closest('.overlay');
      if (overlay) overlay.classList.add('hidden');
    }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#saved-panel').classList.contains('open')) closeSavedPanel();
    document.querySelectorAll('.overlay:not(.hidden)').forEach(o => o.classList.add('hidden'));
    menu.classList.add('hidden');
  });

  /* image uploads */
  bindImageUpload('#upload-logo', '#logo-file', 'design.logoUrl');
  bindImageUpload('#upload-banner', '#banner-file', 'design.bannerUrl');

  rebuildAll();
}

document.addEventListener('DOMContentLoaded', init);
