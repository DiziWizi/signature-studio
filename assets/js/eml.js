/* Signature Studio — .eml import (v0.89).
   A small, dependency-free RFC 822 reader: headers, multipart boundaries,
   base64 and quoted-printable. It extracts the message's HTML (or plain
   text) so the existing signature importer can do the field recovery.

   .msg (Outlook compound file) is deliberately NOT parsed: it is an OLE2
   container with MAPI property streams, not a MIME message. The handler
   detects the magic bytes and tells the user to save as .eml or .html. */
'use strict';

function emlUnescapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emlDecodeQuotedPrintable(input) {
  const bytes = [];
  const text = String(input).replace(/=\r?\n/g, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(text.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function emlBase64Bytes(input) {
  const clean = String(input).replace(/[^A-Za-z0-9+/=]/g, '');
  let bin = '';
  try {
    bin = atob(clean);
  } catch (e) {
    return new Uint8Array(0); /* malformed base64: treat the part as empty */
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function emlDecodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch (e) {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function emlSplitHeaders(block) {
  const idx = block.search(/\r?\n\r?\n/);
  const head = idx === -1 ? block : block.slice(0, idx);
  const body = idx === -1 ? '' : block.slice(idx).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  const unfolded = head.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }
  return { headers, body };
}

function emlCharsetOf(contentType) {
  const match = /charset\s*=\s*"?([^";]+)"?/i.exec(String(contentType || ''));
  return match ? match[1].trim() : 'utf-8';
}

function emlDecodePart(part) {
  const ctype = String(part.headers['content-type'] || 'text/plain');
  const cte = String(part.headers['content-transfer-encoding'] || '').toLowerCase();
  const charset = emlCharsetOf(ctype);
  let text = part.body;
  if (cte.includes('base64')) {
    text = emlDecodeBytes(emlBase64Bytes(part.body), charset);
  } else if (cte.includes('quoted-printable')) {
    text = emlDecodeBytes(emlDecodeQuotedPrintable(part.body), charset);
  }
  return { type: ctype.split(';')[0].trim().toLowerCase(), text };
}

function emlSplitMultipart(body, boundary) {
  const parts = [];
  const marker = new RegExp(`(?:^|\\r?\\n)--${emlUnescapeRegex(boundary)}(?:--)?[^\\r\\n]*`, 'g');
  let last = null;
  let match;
  while ((match = marker.exec(body))) {
    if (last !== null) {
      parts.push(body.slice(last, match.index).replace(/^\r?\n/, ''));
    }
    if (/--\s*$/.test(match[0])) { last = null; break; }
    last = marker.lastIndex;
  }
  if (last !== null) parts.push(body.slice(last));
  return parts.filter(p => p.trim());
}

function emlCollect(part, out, depth = 0) {
  if (depth > 6) return;
  const ctype = String(part.headers['content-type'] || '');
  if (/^multipart\//i.test(ctype)) {
    const boundary = (/boundary\s*=\s*"?([^";]+)"?/i.exec(ctype) || [])[1];
    if (!boundary) return;
    for (const chunk of emlSplitMultipart(part.body, boundary)) {
      emlCollect(emlSplitHeaders(chunk), out, depth + 1);
    }
    return;
  }
  const decoded = emlDecodePart(part);
  if (decoded.type === 'text/html') out.html.push(decoded.text);
  else if (decoded.type === 'text/plain') out.plain.push(decoded.text);
}

/* Returns the longest HTML part (falling back to plain text) plus subject. */
function parseEml(text) {
  const root = emlSplitHeaders(String(text || ''));
  const out = { html: [], plain: [] };
  emlCollect(root, out);
  const longest = list => list.slice().sort((a, b) => b.length - a.length)[0] || '';
  return {
    html: longest(out.html),
    plain: longest(out.plain),
    subject: String(root.headers.subject || ''),
  };
}

function isCompoundFile(bytes) {
  return bytes && bytes.length > 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF &&
    bytes[2] === 0x11 && bytes[3] === 0xE0;
}
