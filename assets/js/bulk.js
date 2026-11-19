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
