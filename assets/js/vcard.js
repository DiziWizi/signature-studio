/* Bowerbird Signature Builder — vCard 3.0 export. */
'use strict';

/* Escape a vCard field value per RFC 2426: backslash first, then ; , and newlines. */
function vcardEscape(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/* UTF-8 octets needed for one code point. */
function utf8Octets(ch) {
  const c = ch.codePointAt(0);
  return c <= 0x7F ? 1 : c <= 0x7FF ? 2 : c <= 0xFFFF ? 3 : 4;
}

function utf8Len(str) {
  let n = 0;
  for (const ch of str) n += utf8Octets(ch);
  return n;
}

/* Longest prefix of str that fits in maxOctets without splitting a UTF-8
   sequence (always returns at least one character). */
function byteSlice(str, maxOctets) {
  let used = 0;
  let units = 0;
  for (const ch of str) {
    const n = utf8Octets(ch);
    if (used + n > maxOctets && units > 0) break;
    used += n;
    units += ch.length;
  }
  return str.slice(0, units);
}

/* Fold a logical line into physical lines of at most 75 octets each, joined by
   CRLF; continuation lines carry a single leading space (which counts toward
   the 75 octets). */
function foldVCardLine(line) {
  const out = [];
  let rest = line;
  if (utf8Len(rest) <= 75) return rest;
  let first = true;
  while (rest.length > 0) {
    if (first) {
      const head = byteSlice(rest, 75);
      out.push(head);
      rest = rest.slice(head.length);
      first = false;
    } else {
      if (utf8Len(rest) + 1 <= 75) {
        out.push(' ' + rest);
        break;
      }
      const head = byteSlice(rest, 74); // 1 octet reserved for the space
      out.push(' ' + head);
      rest = rest.slice(head.length);
    }
  }
  return out.join('\r\n');
}

/* Assemble a folded logical line: NAME;PARAM;...:VALUE (RFC 2426). When
   `components` is given the value is structured: each component is escaped
   individually and joined with unescaped semicolons. */
function vcardField(name, params, value, components) {
  let line = name;
  if (params && params.length) line += ';' + params.map(p => vcardEscape(p)).join(';');
  line += ':' + (components ? components.map(vcardEscape).join(';') : vcardEscape(value));
  return foldVCardLine(line);
}

/* Split a display name into family/given at the last space. */
function splitName(name) {
  const s = String(name || '').trim().replace(/\s+/g, ' ');
  if (!s) return { family: '', given: '' };
  const idx = s.lastIndexOf(' ');
  if (idx === -1) return { family: s, given: '' };
  return { family: s.slice(idx + 1), given: s.slice(0, idx) };
}

/* Address text → ADR components [po, ext, street, locality, region, postal,
   country]. Line 1 is the street, line 2 the locality; any further lines are
   folded into the street. */
function adrComponents(address) {
  const lines = String(address || '')
    .split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (!lines.length) return null;
  const street = [lines[0]].concat(lines.slice(2)).join(', ');
  const locality = lines[1] || '';
  return ['', '', street, locality, '', '', ''];
}

/* Social URL: reuse the app's normalizer when present, else the raw URL. */
function socialUrlFor(social) {
  const raw = String((social && social.url) || '').trim();
  if (!raw) return '';
  if (typeof normalizeUrl === 'function') {
    try { return normalizeUrl(social.network, raw); } catch (e) { return raw; }
  }
  return raw;
}

/* Deterministic vCard UID seed: the lowercased email, or the full name when
   there is no email. */
function vcardUidSeed(state) {
  const p = state.profile || {};
  const c = state.contact || {};
  const email = String(c.email || '').trim().toLowerCase();
  return email || String(p.name || '').trim();
}

/* Deterministic urn:uuid from a seed string: 64-bit djb2 (hash = hash*33 +
   char). The 64-bit result (16 hex chars) is laid into the UUID's 8-4-4-4-12
   hex layout left-aligned; groups beyond the hash are zero-padded to their
   width. Same seed → same UID. */
function vcardUid(seed) {
  let h = 5381n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33n + BigInt(seed.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
  }
  const hex = h.toString(16).padStart(16, '0').padEnd(32, '0');
  return 'urn:uuid:' + [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

/* Build a vCard 3.0 string from the Bowerbird Signature Builder state shape. */
function buildVCard(state, opts = {}) {
  const s = state || {};
  const p = s.profile || {};
  const c = s.contact || {};
  const d = s.design || {};
  const socials = Array.isArray(s.socials) ? s.socials : [];
  const customs = Array.isArray(s.customLines) ? s.customLines : [];
  const lines = [];

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  const fullName = String(p.name || '').trim();
  const displayName = String(p.displayName || '').trim() || fullName;
  const name = splitName(fullName);
  const honorificPrefix = String(p.honorificPrefix || '').trim();
  const honorificSuffix = String(p.honorificSuffix || '').trim();
  if (name.family || name.given) {
    lines.push(vcardField('FN', null, displayName));
    lines.push(vcardField('N', null, null, [name.family, name.given, '', honorificPrefix, honorificSuffix]));
  }
  const logoUrl = String(d.logoUrl || '').trim();
  if (/^http/i.test(logoUrl)) lines.push(vcardField('PHOTO', ['VALUE=URI'], logoUrl));
  /* Uploaded images live as data: URLs — embed a downscaled copy so the
     recipient's address book gets a picture, not just a placeholder. */
  const photoUri = String(opts.photoUri || '').trim();
  if (/^https?:\/\//i.test(photoUri)) lines.push(vcardField('PHOTO', ['VALUE=URI'], photoUri));
  const photo = String(opts.photoDataUrl || '');
  const photoMatch = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(photo);
  if (photoMatch) {
    const type = photoMatch[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
    lines.push(vcardField('PHOTO', ['ENCODING=b', 'TYPE=' + type], photoMatch[2].replace(/\s+/g, '')));
  }

  const orgParts = [p.company, p.department]
    .map(x => String(x || '').trim())
    .filter(Boolean);
  if (orgParts.length) lines.push(vcardField('ORG', null, null, orgParts));
  if (p.title) lines.push(vcardField('TITLE', null, p.title));

  if (c.email) lines.push(vcardField('EMAIL', ['TYPE=INTERNET'], c.email));
  if (c.email2) lines.push(vcardField('EMAIL', ['TYPE=INTERNET'], c.email2));
  if (c.phone) lines.push(vcardField('TEL', ['TYPE=WORK'], c.phone));
  if (c.mobile) lines.push(vcardField('TEL', ['TYPE=CELL'], c.mobile));
  if (c.website) {
    const href = (typeof normalizeUrl === 'function')
      ? normalizeUrl('custom', c.website)
      : (/^https?:/i.test(c.website) ? c.website : 'https://' + c.website);
    lines.push(vcardField('URL', null, href));
  }
  if (c.portfolio) {
    const ph = (typeof normalizeUrl === 'function')
      ? normalizeUrl('custom', c.portfolio)
      : (/^https?:/i.test(c.portfolio) ? c.portfolio : 'https://' + c.portfolio);
    lines.push(vcardField('URL', ['TYPE=PORTFOLIO'], ph));
  }

  const adr = adrComponents(c.address);
  if (adr) lines.push(vcardField('ADR', ['TYPE=WORK'], null, adr));

  for (const sc of socials) {
    const url = socialUrlFor(sc);
    if (url) lines.push(vcardField('X-SOCIALPROFILE', ['TYPE=' + (sc.network || 'custom')], url));
  }

  const pgpKey = String(c.pgpKey || '').trim();
  if (pgpKey) lines.push(vcardField('KEY', ['TYPE=PGP'], pgpKey));

  const noteParts = [];
  for (const cl of customs) {
    const val = String(cl.value || '').trim();
    if (!val) continue;
    const label = String(cl.label || '').trim();
    noteParts.push(label ? label + ': ' + val : val);
  }
  if (d.showLegal && d.legalText) noteParts.push(String(d.legalText));
  if (noteParts.length) lines.push(vcardField('NOTE', null, noteParts.join('\n')));

  /* NICKNAME: displayName, when set and different from the given name. */
  const givenName = fullName.split(/\s+/)[0] || '';
  const nickname = String(p.displayName || '').trim();
  if (nickname && nickname !== givenName) lines.push(vcardField('NICKNAME', null, nickname));
  if (p.timezone) lines.push(vcardField('TZ', null, p.timezone));
  if (p.languages) lines.push(vcardField('LANG', null, p.languages));
  if (p.birthday) lines.push(vcardField('BDAY', null, p.birthday));
  lines.push(vcardField('UID', null, vcardUid(vcardUidSeed(s))));
  lines.push(vcardField('REV', null, new Date().toISOString()));

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/* Assemble one vCard 4.0 logical line: RFC 6350 drops line folding, so each
   property is a single physical line. Values use the same escaping as 3.0. */
function vcardField4(name, params, value, components) {
  let line = name;
  if (params && params.length) line += ';' + params.map(p => vcardEscape(p)).join(';');
  line += ':' + (components ? components.map(vcardEscape).join(';') : vcardEscape(value));
  return line;
}

/* Build a vCard 4.0 string (RFC 6350) from the Bowerbird Signature Builder state shape.
   Mirrors buildVCard() but emits every property on a single line (no folding)
   and adds PRONOUN (RFC 6715). */
function buildVCard4(state) {
  const s = state || {};
  const p = s.profile || {};
  const c = s.contact || {};
  const d = s.design || {};
  const socials = Array.isArray(s.socials) ? s.socials : [];
  const customs = Array.isArray(s.customLines) ? s.customLines : [];
  const lines = [];

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:4.0');

  const fullName = String(p.name || '').trim();
  const displayName = String(p.displayName || '').trim() || fullName;
  const name = splitName(fullName);
  const honorificPrefix = String(p.honorificPrefix || '').trim();
  const honorificSuffix = String(p.honorificSuffix || '').trim();
  if (name.family || name.given) {
    lines.push(vcardField4('FN', null, displayName));
    lines.push(vcardField4('N', null, null, [name.family, name.given, '', '', '']));
  }
  if (honorificPrefix) lines.push(vcardField4('HONORIFIC-PREFIX', null, honorificPrefix));
  if (honorificSuffix) lines.push(vcardField4('HONORIFIC-SUFFIX', null, honorificSuffix));
  const logoUrl = String(d.logoUrl || '').trim();
  if (/^http/i.test(logoUrl)) lines.push(vcardField4('PHOTO', null, logoUrl));

  const orgParts = [p.company, p.department]
    .map(x => String(x || '').trim())
    .filter(Boolean);
  if (orgParts.length) lines.push(vcardField4('ORG', null, null, orgParts));
  if (p.title) lines.push(vcardField4('TITLE', null, p.title));

  if (c.email) lines.push(vcardField4('EMAIL', ['TYPE=INTERNET'], c.email));
  if (c.email2) lines.push(vcardField4('EMAIL', ['TYPE=INTERNET'], c.email2));
  if (c.phone) lines.push(vcardField4('TEL', ['TYPE=WORK'], c.phone));
  if (c.mobile) lines.push(vcardField4('TEL', ['TYPE=CELL'], c.mobile));
  if (c.website) {
    const href = (typeof normalizeUrl === 'function')
      ? normalizeUrl('custom', c.website)
      : (/^https?:/i.test(c.website) ? c.website : 'https://' + c.website);
    lines.push(vcardField4('URL', null, href));
  }
  if (c.portfolio) {
    const ph = (typeof normalizeUrl === 'function')
      ? normalizeUrl('custom', c.portfolio)
      : (/^https?:/i.test(c.portfolio) ? c.portfolio : 'https://' + c.portfolio);
    lines.push(vcardField4('URL', ['TYPE=portfolio'], ph));
  }

  const adr = adrComponents(c.address);
  if (adr) lines.push(vcardField4('ADR', ['TYPE=WORK'], null, adr));

  for (const sc of socials) {
    const url = socialUrlFor(sc);
    if (url) lines.push(vcardField4('X-SOCIALPROFILE', ['TYPE=' + (sc.network || 'custom')], url));
  }

  const pgpKey = String(c.pgpKey || '').trim();
  if (pgpKey) lines.push(vcardField4('KEY', ['TYPE=PGP'], pgpKey));

  const noteParts = [];
  for (const cl of customs) {
    const val = String(cl.value || '').trim();
    if (!val) continue;
    const label = String(cl.label || '').trim();
    noteParts.push(label ? label + ': ' + val : val);
  }
  if (d.showLegal && d.legalText) noteParts.push(String(d.legalText));
  if (noteParts.length) lines.push(vcardField4('NOTE', null, noteParts.join('\n')));

  const pronouns = String(p.pronouns || '').trim();
  if (pronouns) lines.push(vcardField4('PRONOUN', null, pronouns));

  /* NICKNAME: displayName, when set and different from the given name. */
  const givenName = fullName.split(/\s+/)[0] || '';
  const nickname = String(p.displayName || '').trim();
  if (nickname && nickname !== givenName) lines.push(vcardField4('NICKNAME', null, nickname));
  if (p.timezone) lines.push(vcardField4('TZ', null, p.timezone));
  if (p.languages) lines.push(vcardField4('LANG', null, p.languages));
  if (p.birthday) lines.push(vcardField4('BDAY', null, p.birthday));
  lines.push(vcardField4('UID', null, vcardUid(vcardUidSeed(s))));
  lines.push(vcardField4('REV', null, new Date().toISOString()));

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
