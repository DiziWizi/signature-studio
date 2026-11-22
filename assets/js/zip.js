/* Minimal ZIP writer (store, no compression) — pure JS, node-safe.
   Enough for one-shot bulk downloads; UTF-8 filenames with the UTF-8
   flag bit set (0x800). */
'use strict';

const ZIP_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function zipCrc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = ZIP_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipU16(v) { return [v & 255, (v >> 8) & 255]; }
function zipU32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }

/* files: [{ name: string, data: string }] -> Uint8Array of the zip. */
/* Read a store-only ZIP (the kind this app writes). Compressed entries are
   rejected explicitly rather than silently producing garbage. */
function unzipStore(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('bad central directory');
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    if (method !== 0) throw new Error('compressed entries are not supported');
    if (dv.getUint32(localOff, true) !== 0x04034b50) throw new Error('bad local header');
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    out.push({ name, data: bytes.subarray(start, start + compSize) });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
    const crc = zipCrc32(dataBytes);

    const local = [
      ...zipU32(0x04034b50), ...zipU16(20), ...zipU16(0x800), ...zipU16(0),
      ...zipU16(0), ...zipU16(0), ...zipU32(crc), ...zipU32(dataBytes.length),
      ...zipU32(dataBytes.length), ...zipU16(nameBytes.length), ...zipU16(0),
      ...nameBytes, ...dataBytes,
    ];
    chunks.push(new Uint8Array(local));
    central.push({
      nameBytes, crc, size: dataBytes.length, offset,
      header: [
        ...zipU32(0x02014b50), ...zipU16(20), ...zipU16(20), ...zipU16(0x800),
        ...zipU16(0), ...zipU16(0), ...zipU16(0), ...zipU32(crc),
        ...zipU32(dataBytes.length), ...zipU32(dataBytes.length),
        ...zipU16(nameBytes.length), ...zipU16(0), ...zipU16(0), ...zipU16(0),
        ...zipU16(0), ...zipU32(0), ...zipU32(offset),
      ],
    });
    offset += local.length;
  }

  const cdStart = offset;
  for (const c of central) {
    chunks.push(new Uint8Array([...c.header, ...c.nameBytes]));
    offset += c.header.length + c.nameBytes.length;
  }
  const eocd = [
    ...zipU32(0x06054b50), ...zipU16(0), ...zipU16(0),
    ...zipU16(central.length), ...zipU16(central.length),
    ...zipU32(offset - cdStart), ...zipU32(cdStart), ...zipU16(0),
  ];
  chunks.push(new Uint8Array(eocd));

  const total = offset + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
