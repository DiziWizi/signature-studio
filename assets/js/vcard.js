/* Signature Studio — vCard 3.0 export. */
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

/* Build a vCard 3.0 string from the Signature Studio state shape. */
function buildVCard(state) {
  const s = state || {};
  const p = s.profile || {};
  const c = s.contact || {};
  const d = s.design || {};
  const socials = Array.isArray(s.socials) ? s.socials : [];
  const customs = Array.isArray(s.customLines) ? s.customLines : [];
  const lines = [];

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  const name = splitName(p.name);
  if (name.family || name.given) {
    lines.push(vcardField('FN', null, p.name));
    lines.push(vcardField('N', null, null, [name.family, name.given, '', '', '']));
  }

  const orgParts = [p.company, p.department]
    .map(x => String(x || '').trim())
    .filter(Boolean);
  if (orgParts.length) lines.push(vcardField('ORG', null, null, orgParts));
  if (p.title) lines.push(vcardField('TITLE', null, p.title));

  if (c.email) lines.push(vcardField('EMAIL', ['TYPE=INTERNET'], c.email));
  if (c.phone) lines.push(vcardField('TEL', ['TYPE=WORK'], c.phone));
  if (c.mobile) lines.push(vcardField('TEL', ['TYPE=CELL'], c.mobile));
  if (c.website) {
    const href = (typeof normalizeUrl === 'function')
      ? normalizeUrl('custom', c.website)
      : (/^https?:/i.test(c.website) ? c.website : 'https://' + c.website);
    lines.push(vcardField('URL', null, href));
  }

  const adr = adrComponents(c.address);
  if (adr) lines.push(vcardField('ADR', ['TYPE=WORK'], null, adr));

  for (const sc of socials) {
    const url = socialUrlFor(sc);
    if (url) lines.push(vcardField('X-SOCIALPROFILE', ['TYPE=' + (sc.network || 'custom')], url));
  }

  const noteParts = [];
  for (const cl of customs) {
    const val = String(cl.value || '').trim();
    if (!val) continue;
    const label = String(cl.label || '').trim();
    noteParts.push(label ? label + ': ' + val : val);
  }
  if (d.showLegal && d.legalText) noteParts.push(String(d.legalText));
  if (noteParts.length) lines.push(vcardField('NOTE', null, noteParts.join('\n')));

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
