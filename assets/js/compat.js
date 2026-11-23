/* Bowerbird — client compatibility check (v0.83).
   Runs locally against the generated HTML; no network. Levels:
   fail = will visibly break somewhere, warn = may degrade, info = advisory. */
'use strict';

function compatIssues(s, overrideHtml) {
  const issues = [];
  if (typeof renderSignature !== 'function') return issues;
  const html = String(overrideHtml != null ? overrideHtml : renderSignature(s));
  const bytes = new TextEncoder().encode(html).length;
  const kb = bytes / 1024;
  if (bytes > 100 * 1024) {
    issues.push({ level: 'fail', key: 'compat.sizeFail', params: { kb: kb.toFixed(0) } });
  } else if (bytes > 60 * 1024) {
    issues.push({ level: 'warn', key: 'compat.sizeWarn', params: { kb: kb.toFixed(0) } });
  }

  /* The app's own responsive media block is expected; anything else is a
     user-supplied <style> that Gmail strips. */
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) || [];
  const foreign = styleBlocks.filter(block => !/@media\s*\(max-width:\s*599px\)/.test(block));
  if (foreign.length) issues.push({ level: 'fail', key: 'compat.styleBlock' });
  if (/@font-face/i.test(html)) issues.push({ level: 'fail', key: 'compat.fontFace' });
  if (/<script/i.test(html)) issues.push({ level: 'fail', key: 'compat.script' });
  if (/(position\s*:\s*(absolute|fixed))|(display\s*:\s*(flex|grid))/i.test(html)) {
    issues.push({ level: 'fail', key: 'compat.layout' });
  }
  if (/background-image\s*:/i.test(html)) issues.push({ level: 'fail', key: 'compat.background' });

  /* Contrast of the final palette, not just the fields: background colour,
     muted text and links all land in the same message. */
  const bg = /^#[0-9a-f]{3,8}$/i.test(String(s.design.background || '')) ? s.design.background : '#ffffff';
  const ratioOf = (a, b) => (typeof contrastRatio === 'function' ? contrastRatio(a, b) : null);
  const textRatio = ratioOf(s.design.textColor, bg);
  if (textRatio !== null) {
    if (textRatio < 3) issues.push({ level: 'fail', key: 'compat.contrastTextFail', params: { ratio: textRatio.toFixed(1) } });
    else if (textRatio < 4.5) issues.push({ level: 'warn', key: 'compat.contrastTextWarn', params: { ratio: textRatio.toFixed(1) } });
  }
  const muted = typeof mutedColor === 'function' ? mutedColor(s.design) : '';
  const mutedRatio = ratioOf(muted, bg);
  if (mutedRatio !== null && mutedRatio < 4.5) {
    issues.push({ level: 'warn', key: 'compat.contrastMuted', params: { ratio: mutedRatio.toFixed(1) } });
  }
  const linkRatio = ratioOf(s.design.linkColor || s.design.primaryColor, bg);
  if (linkRatio !== null && linkRatio < 4.5) {
    issues.push({ level: 'warn', key: 'compat.contrastLink', params: { ratio: linkRatio.toFixed(1) } });
  }

  const remote = (html.match(/<img\b[^>]*src=["']https?:/gi) || []).length;
  if (remote) issues.push({ level: 'warn', key: 'compat.remote', params: { n: remote } });

  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter(tag => !/\balt\s*=/i.test(tag)).length;
  if (noAlt) issues.push({ level: 'warn', key: 'compat.alt', params: { n: noAlt } });

  const dataChars = (html.match(/data:image\/[^;]+;base64,[^"']+/g) || [])
    .reduce((n, m) => n + m.length, 0);
  if (dataChars > 200 * 1024) {
    issues.push({ level: 'warn', key: 'compat.imageWeight', params: { kb: (dataChars / 1024).toFixed(0) } });
  }

  if (!s.design.strictOutlook && /border-radius\s*:/i.test(html)) {
    issues.push({ level: 'info', key: 'compat.radius', fix: 'strict' });
  }
  return issues;
}

let pendingCompat = null;

function compatRowHtml(issue) {
  const fix = issue.fix === 'strict'
    ? `<button type="button" class="btn btn-sm" data-fix="strict">${esc(t('compat.fixStrict'))}</button>`
    : '';
  return `<div class="compat-row ${issue.level}">
    <span class="compat-level" aria-hidden="true">${issue.level === 'fail' ? '✕' : issue.level === 'warn' ? '!' : 'i'}</span>
    <span class="compat-msg">${esc(t(issue.key, issue.params))}</span>
    ${fix}
  </div>`;
}

function openCompat(pending) {
  pendingCompat = pending || null;
  const out = $('#compat-results');
  if (!out) return;
  const issues = compatIssues(state);
  const cont = $('#compat-continue');
  if (cont) {
    cont.classList.toggle('hidden', !pending);
    cont.textContent = t('compat.continue');
  }
  if (!issues.length) {
    out.innerHTML = `<p class="compat-empty">${esc(t('compat.none'))}</p>`;
  } else {
    out.innerHTML = issues.map(compatRowHtml).join('');
  }
  out.querySelectorAll('[data-fix]').forEach(btn => {
    btn.addEventListener('click', () => applyCompatFix(btn.dataset.fix));
  });
  openOverlay('#modal-compat');
}

function applyCompatFix(fix) {
  if (fix === 'strict') {
    state.design.strictOutlook = true;
    const box = document.querySelector('[data-field="design.strictOutlook"]');
    if (box) box.checked = true;
    renderPreview();
    scheduleSave();
    showToast(t('toast.compatFixed'), '', { key: 'toast.compatFixed' });
  }
  openCompat(pendingCompat);
}

function runCompatGate(fn) {
  const fails = compatIssues(state).filter(i => i.level === 'fail');
  if (!fails.length) return false;
  openCompat(fn);
  return true;
}
