/* Bulk generation: CSV in, ZIP of signature files out. Pure logic — the
   DOM wiring lives in app.js. */
'use strict';

/* Small-but-honest CSV parser: quoted fields, escaped quotes, commas and
   newlines inside quotes. Returns [{ col: value }, ...] or null. */
function parseCsv(text) {
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
    } else if (ch === ',') {
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
function bulkGenerate(state, csvText) {
  const rows = parseCsv(csvText);
  const out = { files: [], generated: 0, skipped: 0 };
  if (!rows.length) return out;
  const header = rows[0];
  const map = bulkColumnMap(header);
  const hasEmail = map.some(m => header[m.idx] && /email/i.test(header[m.idx]));
  if (!map.length || !hasEmail) return { ...out, noEmailColumn: true };

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    const clone = JSON.parse(JSON.stringify(state));
    /* Bulk rows are fresh people: start from a blank identity/contact
       (the template/design carries over, the person does not). */
    for (const k of ['name', 'displayName', 'title', 'department', 'company',
      'pronouns', 'location', 'birthday', 'languages',
      'honorificPrefix', 'honorificSuffix']) clone.profile[k] = '';
    for (const k of ['email', 'phone', 'mobile', 'website', 'address']) clone.contact[k] = '';
    for (const m of map) {
      m.set(clone, (values[m.idx] || '').trim());
    }
    const name = String(clone.profile.name || '').trim();
    const email = String(clone.contact.email || '').trim();
    if (!name || !email) {
      out.skipped += 1;
      continue;
    }
    clone.meta.name = `${name} — ${clone.profile.company || 'Signature'}`;
    if (typeof renderSignature !== 'function') {
      out.skipped += 1;
      continue;
    }
    out.files.push({ name: `${slugify(name)}.html`, data: renderSignature(clone) });
    out.generated += 1;
  }
  return out;
}
