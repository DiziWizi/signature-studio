/* Bowerbird Signature Builder — brand assets and BIMI readiness (v0.82).
   Everything here runs in the browser. The ONLY network call is the explicit
   BIMI "Check" button, which asks Google's public DNS resolver about the
   domain the user typed — no signature data is sent. */
'use strict';

function brandLogoSource() {
  return String((state && state.design && state.design.logoUrl) || '');
}

/* Decode an SVG data: URL (base64 or utf8) into text. */
function svgDataUrlText(src) {
  const m = /^data:image\/svg\+xml([^,]*),(.*)$/i.exec(String(src || ''));
  if (!m) return '';
  try {
    return /;base64/i.test(m[1]) ? atob(m[2].replace(/\s+/g, '')) : decodeURIComponent(m[2]);
  } catch (e) {
    return '';
  }
}

/* Conservative SVG Tiny 1.2 Portable/Secure conversion: drop anything
   executable or external, square the canvas, and stamp the profile. It does
   not vectorise rasters — BIMI needs a real SVG. */
function svgToTinyPs(text) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(String(text || ''), 'image/svg+xml');
  } catch (e) {
    return '';
  }
  if (doc.querySelector('parsererror')) return '';
  const svg = doc.documentElement;
  if (!svg || String(svg.nodeName).toLowerCase() !== 'svg') return '';

  svg.querySelectorAll('script, foreignObject, animate, animateTransform, animateMotion, set').forEach(n => n.remove());
  for (const el of [...svg.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '');
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'xlink:href') && !/^#/.test(value)) el.removeAttribute(attr.name);
      else if (name === 'filter') el.removeAttribute(attr.name);
      else if (name === 'style' && /url\(|expression/i.test(value)) el.removeAttribute(attr.name);
    }
  }

  let vb = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const w = Number(svg.getAttribute('width')) || 0;
  const h = Number(svg.getAttribute('height')) || 0;
  if (vb.length !== 4 || vb.some(n => !Number.isFinite(n))) {
    vb = [0, 0, w || 512, h || 512];
  }
  const [x, y, vw, vh] = vb;
  const side = Math.max(vw, vh);
  const nx = x - (side - vw) / 2;
  const ny = y - (side - vh) / 2;
  svg.setAttribute('viewBox', `${nx} ${ny} ${side} ${side}`);
  svg.setAttribute('width', String(side));
  svg.setAttribute('height', String(side));
  svg.setAttribute('version', '1.2');
  svg.setAttribute('baseProfile', 'tiny-ps');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(svg);
}

function brandImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

function dataUrlBytes(dataUrl) {
  const m = /^data:[^;]+;base64,(.*)$/i.exec(String(dataUrl || ''));
  if (!m) return new Uint8Array(0);
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function assetSnippet(files) {
  const has = name => files.some(f => f.name === name);
  const lines = [
    '<!-- Place these files at the root of your website. -->',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">',
    '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">',
  ];
  if (has('favicon.svg')) lines.push('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
  return lines.join('\n') + '\n';
}

function assetReadme(files) {
  return [
    'Brand asset pack — Bowerbird Signature Builder',
    '',
    'favicon-32.png            browser tab, 32x32',
    'apple-touch-icon-180.png  iOS home screen, 180x180',
    'icon-512.png              PWA / large icon, 512x512',
    ...(files.some(f => f.name === 'favicon.svg') ? ['favicon.svg               scalable icon for browsers that take it'] : []),
    ...(files.some(f => f.name === 'logo-bimi.svg') ? ['logo-bimi.svg            BIMI candidate (SVG Tiny 1.2 PS) — hosting and DNS still required'] : []),
    'snippet.html              <link> tags to paste into your <head>',
    '',
    'Notes',
    '- Proton Mail sometimes shows a sender image taken from the domain favicon,',
    '  but only for domains it already supports — it is not a reliable channel.',
    '- BIMI logos are shown by Gmail, Apple Mail, Yahoo and Fastmail. Microsoft',
    '  Outlook (desktop, web and Outlook.com) does not display them.',
    '- BIMI also needs DMARC enforcement and, for Gmail, a VMC or CMC certificate.',
    '',
  ].join('\n');
}

async function assetPackFiles() {
  const src = brandLogoSource();
  if (!src) return [];
  const files = [];
  const svg = svgDataUrlText(src);
  if (svg) {
    files.push({ name: 'favicon.svg', data: svg });
    const ps = svgToTinyPs(svg);
    if (ps) files.push({ name: 'logo-bimi.svg', data: ps });
  }

  const img = await brandImage(src);
  const sizes = [
    [32, 'favicon-32.png'],
    [180, 'apple-touch-icon-180.png'],
    [512, 'icon-512.png'],
  ];
  const nw = img.naturalWidth || img.width || 0;
  const nh = img.naturalHeight || img.height || 0;
  const side = Math.min(nw, nh) || 512;
  for (const [size, name] of sizes) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, (nw - side) / 2, (nh - side) / 2, side, side, 0, 0, size, size);
    files.push({ name, data: dataUrlBytes(canvas.toDataURL('image/png')) });
  }
  files.push({ name: 'snippet.html', data: assetSnippet(files) });
  files.push({ name: 'README.txt', data: assetReadme(files) });
  return files;
}

async function doAssetPack() {
  let files = [];
  try {
    files = await assetPackFiles();
  } catch (e) {
    files = [];
  }
  if (!files.length) {
    showToast(t('toast.assetNone'), 'warn', { key: 'toast.assetNone' });
    return;
  }
  const zip = zipStore(files);
  downloadBlob(new Blob([zip], { type: 'application/zip' }), `${slugify(state.meta.name)}-brand-assets.zip`);
  showToast(t('toast.assetDownloaded', { n: files.length }), '', { key: 'toast.assetDownloaded', params: { n: files.length } });
}

function doBimiSvg() {
  const svg = svgDataUrlText(brandLogoSource());
  if (!svg) {
    showToast(t('toast.bimiSvgOnly'), 'warn', { key: 'toast.bimiSvgOnly' });
    return;
  }
  const ps = svgToTinyPs(svg);
  if (!ps) {
    showToast(t('toast.bimiSvgBad'), 'err', { key: 'toast.bimiSvgBad' });
    return;
  }
  downloadBlob(new Blob([ps], { type: 'image/svg+xml' }), 'logo-bimi.svg');
  showToast(t('toast.bimiSvgDownloaded'), '', { key: 'toast.bimiSvgDownloaded' });
}

/* ── BIMI readiness ───────────────────────────────────────────────────── */

function normalizeDomain(raw) {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^@/, '')
    .toLowerCase();
}

function domainLooksValid(domain) {
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain);
}

/* dns.google returns TXT data as one or more quoted strings; strip quotes
   and join so the record parses as one line. */
async function dnsTxtRecords(name) {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: 'application/dns-json' },
  });
  if (!res.ok) throw new Error('dns');
  const json = await res.json();
  const answers = Array.isArray(json.Answer) ? json.Answer : [];
  return answers
    .filter(a => Number(a.type) === 16)
    .map(a => String(a.data || '').replace(/"/g, '').trim())
    .filter(Boolean);
}

function parseDmarc(records) {
  const rec = records.find(r => /^v=DMARC1/i.test(r));
  if (!rec) return { found: false, policy: '', record: '' };
  const m = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)/i.exec(rec);
  return { found: true, policy: m ? m[1].toLowerCase() : '', record: rec };
}

function parseBimi(records) {
  const rec = records.find(r => /^v=BIMI1/i.test(r));
  if (!rec) return { found: false, logo: '', cert: '', record: '' };
  const logo = /(?:^|;)\s*l\s*=\s*([^;]+)/i.exec(rec);
  const cert = /(?:^|;)\s*a\s*=\s*([^;]+)/i.exec(rec);
  return { found: true, logo: logo ? logo[1].trim() : '', cert: cert ? cert[1].trim() : '', record: rec };
}

function bimiRecordTemplate(domain) {
  return `default._bimi.${domain}  TIMESTAMP  IN TXT  "v=BIMI1; l=https://${domain}/logo-bimi.svg; a="`;
}

function bimiRow(kind, label, value, note) {
  return `<div class="bimi-row ${kind}">
    <span class="bimi-label">${esc(label)}</span>
    <span class="bimi-value">${esc(value || '—')}</span>
    ${note ? `<span class="bimi-note">${esc(note)}</span>` : ''}
  </div>`;
}

async function runBimiCheck() {
  const input = $('#bimi-domain');
  const out = $('#bimi-results');
  if (!input || !out) return;
  const domain = normalizeDomain(input.value);
  input.value = domain;
  if (!domainLooksValid(domain)) {
    out.innerHTML = `<p class="bimi-error" role="alert">${esc(t('bimi.needDomain'))}</p>`;
    return;
  }
  out.innerHTML = `<p class="micro">${esc(t('bimi.checking'))}</p>`;
  let dmarc = [];
  let bimi = [];
  try {
    [dmarc, bimi] = await Promise.all([
      dnsTxtRecords(`_dmarc.${domain}`),
      dnsTxtRecords(`default._bimi.${domain}`),
    ]);
  } catch (e) {
    out.innerHTML = `<p class="bimi-error" role="alert">${esc(t('bimi.error'))}</p>`;
    return;
  }

  const d = parseDmarc(dmarc);
  const b = parseBimi(bimi);
  const dmarcOk = d.found && (d.policy === 'quarantine' || d.policy === 'reject');
  const rows = [];

  rows.push(bimiRow(
    d.found ? (dmarcOk ? 'pass' : 'warn') : 'fail',
    t('bimi.dmarcLabel'),
    d.found ? `p=${d.policy || '?'}` : t('bimi.none'),
    dmarcOk ? t('bimi.dmarcPass') : t('bimi.dmarcFail'),
  ));
  rows.push(bimiRow(
    b.found ? 'pass' : 'fail',
    t('bimi.recordLabel'),
    b.found ? t('bimi.found') : t('bimi.none'),
    b.found ? t('bimi.recordPass') : t('bimi.recordFail'),
  ));
  if (b.found) {
    rows.push(bimiRow(b.logo ? 'pass' : 'warn', t('bimi.logoLabel'), b.logo || '—',
      b.logo && /\.svg(?:$|\?)/i.test(b.logo) ? t('bimi.logoPass') : t('bimi.logoFail')));
    rows.push(bimiRow(b.cert ? 'pass' : 'warn', t('bimi.certLabel'), b.cert || '—',
      b.cert ? t('bimi.certPass') : t('bimi.certFail')));
  }

  const blocked = !d.found || !b.found;
  rows.push(`<div class="bimi-verdict ${blocked ? 'fail' : (dmarcOk && b.logo ? 'pass' : 'warn')}">
    ${esc(blocked ? t('bimi.verdictBlocked') : (dmarcOk && b.logo ? t('bimi.verdictReady') : t('bimi.verdictAlmost')))}
  </div>`);
  rows.push(`<p class="micro">${esc(t('bimi.msNote'))}</p>`);
  rows.push(`<p class="micro">${esc(t('bimi.vmcNote'))}</p>`);
  rows.push(`<div class="bimi-record"><code id="bimi-record-text">${esc(bimiRecordTemplate(domain))}</code></div>`);
  out.innerHTML = rows.join('');
  out.dataset.domain = domain;
  const copyBtn = $('#bimi-copy');
  if (copyBtn) copyBtn.disabled = false;
}

function openBimi() {
  openOverlay('#modal-bimi');
  const out = $('#bimi-results');
  if (out) out.innerHTML = '';
  const copyBtn = $('#bimi-copy');
  if (copyBtn) copyBtn.disabled = true;
  const domain = $('#bimi-domain');
  if (domain && !domain.value) {
    const email = String((state.contact && state.contact.email) || '');
    const at = email.lastIndexOf('@');
    if (at > -1) domain.value = normalizeDomain(email.slice(at + 1));
  }
}

async function copyBimiRecord() {
  const text = $('#bimi-record-text');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text.textContent.trim());
    showToast(t('bimi.recordCopied'), '', { key: 'toast.bimiRecordCopied' });
  } catch (e) {
    showToast(t('toast.copyFail'), 'err', { key: 'toast.copyFail' });
  }
}
