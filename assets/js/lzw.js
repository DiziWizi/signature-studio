/* Minimal LZW codec for shareable state links. Pure JS, node-safe (no DOM).
   Byte-level LZW over UTF-8 (full 256-byte alphabet seeded), 16-bit codes,
   dictionary capped at 65535 entries on both sides. */
'use strict';

function lzwEncode(str) {
  const bytes = Array.from(new TextEncoder().encode(String(str)));
  const dict = new Map();
  for (let i = 0; i < 256; i++) dict.set(String(i), i); /* keys are strings to hold small ints compactly */
  let next = 256;
  let w = null;
  const out = [];
  for (const b of bytes) {
    const wb = (w === null ? '' : w + ',') + b;
    if (dict.has(wb)) {
      w = wb;
      continue;
    }
    if (w !== null) out.push(dict.get(w));
    if (next < 65535) dict.set(wb, next++);
    w = String(b);
  }
  if (w !== null) out.push(dict.get(w));
  const bin = [];
  for (const code of out) bin.push(code & 255, code >> 8);
  let s = '';
  for (let i = 0; i < bin.length; i += 8192) {
    s += String.fromCharCode.apply(null, bin.slice(i, i + 8192));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function lzwDecode(data) {
  try {
    const b64 = String(data).replace(/-/g, '+').replace(/_/g, '/');
    if (b64 === '') return '';
    const bin = atob(b64);
    if (bin.length < 2) return null;
    const codes = [];
    for (let i = 0; i + 1 < bin.length; i += 2) {
      codes.push(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8));
    }
    if (!codes.length) return null;
    const dict = new Map();
    for (let i = 0; i < 256; i++) dict.set(i, [i]);
    let next = 256;
    let prev = dict.get(codes[0]);
    if (!prev) return null;
    const bytes = prev.slice();
    for (let i = 1; i < codes.length; i++) {
      const code = codes[i];
      let entry = dict.get(code);
      if (!entry) {
        if (code === next) entry = prev.concat([prev[0]]);
        else return null;
      }
      for (const v of entry) bytes.push(v);
      if (next < 65535) dict.set(next++, prev.concat([entry[0]]));
      prev = entry;
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (e) {
    return null;
  }
}
