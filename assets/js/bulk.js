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
   assets are decoded to real files the zip carries; hosted URLs are
   listed by reference so a mailer can fetch them. */
function bulkManifest(state) {
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
      const mime = m[1];
      let ext = mime.split('/')[1].replace(/\+.*/, '');
      if (ext === 'jpeg') ext = 'jpg';
      const file = `images/sigstudio-${key}.${ext}`;
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      assets.push({ name: file, data: bytes });
      manifest.images.push({ cid: `sigstudio-${key}`, file, mime });
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
  if (state.design && state.design.imageMode === 'cid') {
    const m = bulkManifest(state);
    if (m) {
      out.files.push({ name: 'manifest.json', data: JSON.stringify(m.manifest, null, 2) });
      for (const a of m.assets) out.files.push(a);
    }
  }
  return out;
}
