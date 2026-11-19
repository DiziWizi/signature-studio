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
