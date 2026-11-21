/* Bulk generation: CSV in, ZIP of signature files out. Pure logic — the
   DOM wiring lives in app.js. */
'use strict';

/* Small-but-honest CSV parser: quoted fields, escaped quotes, commas and
   newlines inside quotes. Returns [{ col: value }, ...] or null. */
function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

/* Fuzzy column mapping: 'first name' and 'first_name' both -> firstName. */
const BULK_COLUMNS = [
  { keys: ['name', 'fullname', 'displayname'], set: (s, v) => { s.profile.name = v; } },
  { keys: ['firstname'], set: (s, v) => { s.profile.name = v; } },
  { keys: ['email', 'emailaddress', 'mail'], set: (s, v) => { s.contact.email = v; } },
  { keys: ['title', 'jobtitle', 'role'], set: (s, v) => { s.profile.title = v; } },
  { keys: ['department', 'team'], set: (s, v) => { s.profile.department = v; } },
  { keys: ['company', 'organisation', 'organization'], set: (s, v) => { s.profile.company = v; } },
  { keys: ['phone', 'telephone'], set: (s, v) => { s.contact.phone = v; } },
  { keys: ['mobile', 'cell', 'cellphone'], set: (s, v) => { s.contact.mobile = v; } },
  { keys: ['website', 'url', 'web'], set: (s, v) => { s.contact.website = v; } },
  { keys: ['address'], set: (s, v) => { s.contact.address = v; } },
  { keys: ['pronouns'], set: (s, v) => { s.profile.pronouns = v; } },
  { keys: ['location', 'city'], set: (s, v) => { s.profile.location = v; } },
];

function bulkColumnMap(header) {
  const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = [];
  header.forEach((h, idx) => {
    const n = norm(h);
    const col = BULK_COLUMNS.find(c => c.keys.some(k => n === k));
    if (col) map.push({ idx, set: col.set });
  });
  return map;
}

/* CID mode: map every signature image to its deterministic Content-ID
   (sigstudio-logo, sigstudio-banner, sigstudio-footer-left/…). Data-URI
   assets are decoded, downscaled to their display size and re-encoded
   (JPEG 0.85 for opaque photos, PNG for transparency) so attached parts
   cost the least possible per message; hosted URLs are listed by
   reference so a mailer can fetch them. */
function dataUriBytes(uri) {
  const m = String(uri || '').match(/^data:[^,]+,(.*)$/s);
  if (!m) return 0;
  return Math.round((m[1].replace(/\s+/g, '').length * 3) / 4);
}

function rawAsset(dataUri, key, mime) {
  const m = String(dataUri).match(/^data:[^,]+,(.*)$/s);
  const bin = m ? atob(m[1]) : '';
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let ext = (mime || 'image/png').split('/')[1].replace(/\+.*/, '');
  if (ext === 'jpeg') ext = 'jpg';
  return { cid: `sigstudio-${key}`, file: `images/sigstudio-${key}.${ext}`, bytes, mime: mime || 'image/png', width: 0, height: 0, optimized: false };
}

function optimizeImage(dataUri, targetWidth) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, targetWidth / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, w, h);
        const data = x.getImageData(0, 0, w, h).data;
        let transparent = false;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) { transparent = true; break; }
        }
        const mime = transparent ? 'image/png' : 'image/jpeg';
        const dataUrl = c.toDataURL(mime, mime === 'image/jpeg' ? 0.85 : undefined);
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve({ bytes, mime, width: w, height: h, optimized: true });
      } catch (e) {
        resolve(null); /* caller falls back to the raw payload */
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUri;
  });
}

/* Display widths the optimiser targets (px). */
function bulkTargetWidth(state, key) {
  const d = state.design || {};
  if (key === 'logo') return Math.min(300, Math.max(20, Number(d.logoWidth) || 72));
  if (key === 'banner') return 600;
  if (key.startsWith('footer-')) return 96;
  if (key.startsWith('social-')) {
    const n = Number(d.socialSize);
    return Number.isFinite(n) ? Math.min(28, Math.max(16, n)) : 22;
  }
  return 600;
}

/* Single-signature CID package: the rendered HTML plus the image
   parts and manifest — the same ZIP shape the bulk generator produces,
   for one signature (the current template/design). */
async function singleCidPackage(state) {
  const html = renderSignature(state);
  const m = await bulkAssetsAsync(state);
  const files = [{ name: `${slugify(state.meta.name)}-signature.html`, data: html }];
  if (m) {
    files.push({ name: 'manifest.json', data: JSON.stringify(m.manifest, null, 2) });
    for (const a of m.assets) files.push({ name: a.name, data: a.data });
  }
  return files;
}

async function bulkAssetsAsync(state) {
  const d = state.design || {};
  const fields = [
    ['logo', d.logoUrl],
    ['banner', d.bannerUrl],
    ['footer-left', d.footerLeftImg],
    ['footer-center', d.footerCenterImg],
    ['footer-right', d.footerRightImg],
  ];
  (state.socials || []).forEach(soc => {
    if (soc.iconUrl) fields.push(['social-' + soc.network, soc.iconUrl]);
  });
  const manifest = { version: 1, mode: 'cid', images: [] };
  const assets = [];
  for (const [key, value] of fields) {
    const v = String(value || '').trim();
    if (!v) continue;
    const m = v.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
    if (m) {
      const sourceMime = m[1];
      const originalBytes = dataUriBytes(v);
      const opt = await optimizeImage(v, bulkTargetWidth(state, key));
      const entry = { cid: `sigstudio-${key}` };
      if (opt && opt.bytes.length < originalBytes) {
        let ext = opt.mime.split('/')[1].replace(/\+.*/, '');
        if (ext === 'jpeg') ext = 'jpg';
        entry.file = `images/sigstudio-${key}.${ext}`;
        entry.mime = opt.mime;
        entry.width = opt.width;
        entry.height = opt.height;
        entry.optimized = true;
        assets.push({ name: entry.file, data: opt.bytes });
      } else {
        const raw = rawAsset(v, key, sourceMime);
        entry.file = raw.file;
        entry.mime = raw.mime;
        entry.optimized = false;
        assets.push({ name: raw.file, data: raw.bytes });
      }
      manifest.images.push(entry);
    } else {
      manifest.images.push({ cid: `sigstudio-${key}`, url: v });
    }
  }
  return manifest.images.length ? { assets, manifest } : null;
}

/* Returns { files: [{name, data}], generated, skipped }. */
/* Delimiter sniffing: teams paste from Excel (comma), German Excel (;),
   Google Sheets (tab) and CSV exported with a BOM. */
function bulkDelimiter(text) {
  const first = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts[ch] !== undefined) counts[ch] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

function bulkBaseName(name, email) {
  const local = String(email.split('@')[0] || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `${slugify(name)}${local ? '-' + slugify(local) : ''}`;
}

/* Plan only: parse and classify every row so the modal can show exactly
   what will happen before anything is generated. `status` is one of
   ready | noName | noEmail | duplicate. */
function bulkPlan(state, csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const delim = bulkDelimiter(text);
  const rows = parseCsv(text, delim);
  const plan = { rows: [], header: [], noEmailColumn: false, empty: !rows.length, delimiter: delim };
  if (!rows.length) return plan;
  plan.header = rows[0];
  const map = bulkColumnMap(rows[0]);
  const hasEmail = map.some(m => rows[0][m.idx] && /email/i.test(rows[0][m.idx]));
  if (!map.length || !hasEmail) { plan.noEmailColumn = true; return plan; }

  const seen = new Set();
  const usedFiles = new Set();
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    const clone = JSON.parse(JSON.stringify(state));
    for (const k of ['name', 'displayName', 'title', 'department', 'company',
      'pronouns', 'location', 'birthday', 'languages',
      'honorificPrefix', 'honorificSuffix']) clone.profile[k] = '';
    for (const k of ['email', 'phone', 'mobile', 'website', 'address']) clone.contact[k] = '';
    for (const m of map) m.set(clone, (values[m.idx] || '').trim());

    const name = String(clone.profile.name || '').trim();
    const email = String(clone.contact.email || '').trim();
    const key = `${name}|${email}`.toLowerCase();
    let status = 'ready';
    if (!name) status = 'noName';
    else if (!email) status = 'noEmail';
    else if (seen.has(key)) status = 'duplicate';

    let filename = '';
    if (status === 'ready') {
      seen.add(key);
      const base = bulkBaseName(name, email);
      filename = `${base}.html`;
      let n = 2;
      while (usedFiles.has(filename)) filename = `${base}-${n++}.html`;
      usedFiles.add(filename);
      clone.meta.name = `${name} — ${clone.profile.company || 'Signature'}`;
    }
    plan.rows.push({ line: r + 1, name, email, status, filename, state: clone });
  }
  return plan;
}

function bulkGenerate(state, csvText) {
  const plan = bulkPlan(state, csvText);
  const out = { files: [], generated: 0, skipped: 0, duplicates: 0 };
  if (plan.empty) return out;
  if (plan.noEmailColumn) return Object.assign(out, { noEmailColumn: true });
  for (const row of plan.rows) {
    if (row.status !== 'ready') {
      out.skipped += 1;
      if (row.status === 'duplicate') out.duplicates += 1;
      continue;
    }
    if (typeof renderSignature !== 'function') { out.skipped += 1; continue; }
    out.files.push({ name: row.filename, data: renderSignature(row.state) });
    out.generated += 1;
  }
  return out;
}
