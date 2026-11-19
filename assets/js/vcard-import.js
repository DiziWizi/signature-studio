/* vCard import (RFC 2426/6350, versions 3.0 + 4.0): parse a pasted .vcf
   into a partial profile/contact field set. Merge-only: absent properties
   leave the current state untouched. Pure function, node-safe. */
'use strict';

/* Unfold RFC-style folded lines (continuations starting with space/tab),
   split into property lines, tolerate CRLF/LF and 4.0's UTF-8. */
function parseVCard(text) {
  const out = { profile: {}, contact: {}, notes: [] };
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const unfolded = raw.replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.some(l => /^(BEGIN|FN|N|EMAIL|TEL|ORG|TITLE):/i.test(l))) {
    out.error = true;
    return out;
  }

  let firstEmail = true;
  for (const line of lines) {
    if (/^BEGIN:/i.test(line) || /^END:/i.test(line) || /^VERSION:/i.test(line)) continue;
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    const props = line.slice(0, ci);
    const value = line.slice(ci + 1).trim();
    if (!value) continue;
    const [name, ...params] = props.split(';');
    const key = name.toUpperCase();
    const par = params.map(p => p.toLowerCase().split('='));

    switch (key) {
      case 'FN':
        if (!out.profile.name) out.profile.name = value;
        break;
      case 'N': {
        /* Family;Given;Middle;Prefix;Suffix (our vcard.js export order). */
        const parts = value.split(';');
        const family = (parts[0] || '').trim();
        const given = (parts[1] || '').trim();
        const prefix = (parts[3] || '').trim();
        const suffix = (parts[4] || '').trim();
        if (!out.profile.name && (given || family)) {
          out.profile.name = `${prefix ? prefix + ' ' : ''}${given}${given && family ? ' ' : ''}${family}${suffix ? ', ' + suffix : ''}`.trim();
        }
        if (prefix && !out.profile.honorificPrefix) out.profile.honorificPrefix = prefix;
        if (suffix && !out.profile.honorificSuffix) out.profile.honorificSuffix = suffix;
        break;
      }
      case 'EMAIL': {
        const isWork = par.some(([k, v]) => k === 'type' && /work/i.test(v || ''));
        if (firstEmail || isWork || !out.contact.email) {
          out.contact.email = value;
          firstEmail = false;
        }
        break;
      }
      case 'TEL': {
        const type = par.find(([k]) => k === 'type');
        const t = type ? (type[1] || '') : '';
        if (/cell|mobile/i.test(t)) { if (!out.contact.mobile) out.contact.mobile = value; }
        else if (!out.contact.phone) out.contact.phone = value;
        break;
      }
      case 'TITLE':
        if (!out.profile.title) out.profile.title = value;
        break;
      case 'ORG': {
        const org = value.split(';');
        if (org[0] && !out.profile.company) out.profile.company = org[0].trim();
        if (org[1] && !out.profile.department) out.profile.department = org[1].trim();
        break;
      }
      case 'URL':
        if (!out.contact.website) out.contact.website = value;
        break;
      case 'ADR': {
        /* PO box;ext;street;locality;region;postcode;country — keep the
           parts people actually see, one per line. */
        const a = value.split(';');
        const keep = [a[2], a[3], a[4], a[5], a[6]].map(s => (s || '').trim()).filter(Boolean);
        if (keep.length && !out.contact.address) out.contact.address = keep.join('\n');
        break;
      }
      case 'BDAY':
        if (!out.profile.birthday) out.profile.birthday = value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
        break;
      case 'LANG':
        if (!out.profile.languages) out.profile.languages = value;
        break;
      case 'PRONOUN':
      case 'X-PRONOUN':
        if (!out.profile.pronouns) out.profile.pronouns = value;
        break;
      case 'KEY': {
        const isPgp = par.some(([k, v]) => k === 'type' && /pgp/i.test(v || '')) || /PGP/i.test(value);
        if (isPgp && !out.contact.pgpKey) out.contact.pgpKey = value;
        break;
      }
      case 'PHOTO':
        out.photoIgnored = true;
        break;
      default:
        break;
    }
  }
  return out;
}
