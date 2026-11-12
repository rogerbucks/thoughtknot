// A small zip writer of ThoughtKnot's own (editor spec §67, format_text_first, format_compose_out). With it, a Word file
// is composed with no library. Each file is stored, not compressed, with its CRC-32, as the zip format allows (PKWARE
// APPNOTE 6.3). A local header and the bytes of each file come first, then the central directory and its end. There
// is no Zip64, no encryption and no extra field. So it is short, and every reader opens it. Host-free and pure.

import { utf8 } from './ai-digest.ts';

/** One file of a zip: its path inside it, with forward slashes, and its bytes. */
export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

/** The CRC-32 table of the zip format's polynomial, made once. */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** The CRC-32 of `bytes`, as the zip format checks it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The day and time a zip writes for every file: 1 January 1980, the earliest it holds, so one graph gives one file. */
const DOS_TIME = 0,
  DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** The files in one zip, stored in the order given. Throws when a path is empty or the zip would pass 4 GB. */
export function zipStored(entries: readonly ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  for (const e of entries) {
    if (!e.path) throw new Error('a file in a zip needs a path');
    const name = Uint8Array.from(utf8(e.path));
    const crc = crc32(e.bytes),
      size = e.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed: 2.0
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory header
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, DOS_TIME, true);
    dir.setUint16(14, DOS_DATE, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, at, true); // where its local header is
    parts.push(new Uint8Array(local.buffer), name, e.bytes);
    central.push(new Uint8Array(dir.buffer), name);
    at += 30 + name.length + size;
    if (at > 0xffffffff) throw new Error('a zip this writer makes must stay under 4 GB');
  }
  const dirSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, at, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
