// A zip file read in plain JavaScript, and the deflate stream (RFC 1951) inside it.
// It is the way into an .xlsx workbook (ES§63 connector_files_to_gql, ES§67 format_untrusted_files). No library and no WebAssembly.
// - Untrusted: each size and offset is checked, and a part is inflated only to the size it declares.
// - Zip64, encryption and split files are refused as damage.
import { utf8 } from './sqlite-read.ts';

/** The file is damaged, or in a form this reader does not know. */
export class Damaged extends Error {}
/** A part declares more than the most it may hold. */
export class TooBig extends Error {}

// ---- the zip --------------------------------------------------------------------------------------------------

/** A file the zip lists: its name, how it is packed, its sizes, and where its local header is. */
export interface ZipEntry {
  name: string;
  method: number;
  size: number;
  packed: number;
  at: number;
}

/** A 16-bit little-endian number at `i`; a byte past the end reads as 0. */
export const u16 = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
/** A 32-bit little-endian number at `i`. */
export const u32 = (b: Uint8Array, i: number) => (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0;

/** The files a zip lists, by its central directory at the end. Zip64, encryption and a split file are refused. */
export function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--)
    if (u32(b, i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Damaged();
  const count = u16(b, end + 10);
  const start = u32(b, end + 16);
  if (count === 0xffff || start === 0xffffffff || u16(b, end + 4) !== 0) throw new Damaged();
  const out = new Map<string, ZipEntry>();
  let p = start;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new Damaged();
    const [flags, method, packed, size] = [u16(b, p + 8), u16(b, p + 10), u32(b, p + 20), u32(b, p + 24)];
    const [nameLen, more] = [u16(b, p + 28), u16(b, p + 30) + u16(b, p + 32)];
    if (flags & 1 || p + 46 + nameLen > b.length) throw new Damaged();
    const name = utf8(b.subarray(p + 46, p + 46 + nameLen));
    out.set(name.toLowerCase(), { name, method, size, packed, at: u32(b, p + 42) });
    p += 46 + nameLen + more;
  }
  return out;
}

// ---- inflate (RFC 1951) -----------------------------------------------------------------------------------------

interface Huffman {
  count: Uint16Array;
  symbol: Uint16Array;
}

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huffman(lengths: number[]): Huffman {
  const count = new Uint16Array(16);
  for (const l of lengths) count[l] = (count[l] ?? 0) + 1;
  const offs = new Uint16Array(17);
  for (let l = 1; l < 16; l++) offs[l + 1] = (offs[l] ?? 0) + (count[l] ?? 0);
  const symbol = new Uint16Array(lengths.length);
  lengths.forEach((l, s) => {
    if (!l) return;
    symbol[offs[l] ?? 0] = s;
    offs[l] = (offs[l] ?? 0) + 1;
  });
  return { count, symbol };
}

const FIXED = (() => {
  const l = Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));
  return { lit: huffman(l), dist: huffman(new Array<number>(30).fill(5)) };
})();

/** The raw deflate stream in `src` from `at`, inflated to exactly `size` bytes; anything else is damage. */
function inflate(src: Uint8Array, at: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let [o, p, buf, have] = [0, at, 0, 0];
  const bits = (n: number): number => {
    while (have < n) {
      if (p >= src.length) throw new Damaged();
      buf |= (src[p++] ?? 0) << have;
      have += 8;
    }
    const v = buf & ((1 << n) - 1);
    [buf, have] = [buf >>> n, have - n];
    return v;
  };
  const decode = (h: Huffman): number => {
    let [code, first, index] = [0, 0, 0];
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len] ?? 0;
      if (code - c < first) return h.symbol[index + (code - first)] ?? 0;
      [index, first, code] = [index + c, (first + c) << 1, code << 1];
    }
    throw new Damaged();
  };
  const codes = (lit: Huffman, dist: Huffman) => {
    for (;;) {
      const s = decode(lit);
      if (s < 256) {
        if (o >= size) throw new Damaged();
        out[o++] = s;
      } else if (s === 256) return;
      else {
        const k = s - 257;
        if (k >= 29) throw new Damaged();
        const len = (LEN_BASE[k] ?? 0) + bits(LEN_EXTRA[k] ?? 0);
        const d = decode(dist);
        if (d >= 30) throw new Damaged();
        const back = (DIST_BASE[d] ?? 0) + bits(DIST_EXTRA[d] ?? 0);
        if (back > o || o + len > size) throw new Damaged();
        for (let i = 0; i < len; i++, o++) out[o] = out[o - back] ?? 0;
      }
    }
  };
  const dynamic = () => {
    const [nl, nd, nc] = [bits(5) + 257, bits(5) + 1, bits(4) + 4];
    if (nl > 286 || nd > 30) throw new Damaged();
    const lens = new Array<number>(19).fill(0);
    for (let i = 0; i < nc; i++) lens[ORDER[i] ?? 0] = bits(3);
    const table = huffman(lens);
    const all: number[] = [];
    while (all.length < nl + nd) {
      const s = decode(table);
      if (s < 16) all.push(s);
      else {
        const prev = s === 16 ? all[all.length - 1] : 0;
        if (prev === undefined) throw new Damaged();
        const n = s === 16 ? 3 + bits(2) : s === 17 ? 3 + bits(3) : 11 + bits(7);
        for (let i = 0; i < n; i++) all.push(prev);
      }
    }
    if (all.length !== nl + nd) throw new Damaged();
    codes(huffman(all.slice(0, nl)), huffman(all.slice(nl)));
  };
  for (let last = 0; !last;) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      [buf, have] = [0, 0];
      const n = u16(src, p);
      if (p + 4 + n > src.length || (n ^ 0xffff) !== u16(src, p + 2) || o + n > size) throw new Damaged();
      out.set(src.subarray(p + 4, p + 4 + n), o);
      [o, p] = [o + n, p + 4 + n];
    } else if (type === 1) codes(FIXED.lit, FIXED.dist);
    else if (type === 2) dynamic();
    else throw new Damaged();
  }
  if (o !== size) throw new Damaged();
  return out;
}

/** The text of the part `name` of the zip, or null when there is none; a part over the limit is refused. */
export function partText(b: Uint8Array, zip: Map<string, ZipEntry>, name: string, most: number): string | null {
  const e = zip.get(name.replace(/^\//, '').toLowerCase());
  if (!e) return null;
  if (e.size > most) throw new TooBig();
  if (e.at + 30 > b.length || u32(b, e.at) !== 0x04034b50) throw new Damaged();
  const data = e.at + 30 + u16(b, e.at + 26) + u16(b, e.at + 28);
  if (data + e.packed > b.length) throw new Damaged();
  let bytes: Uint8Array;
  if (e.method === 0) {
    if (e.packed !== e.size) throw new Damaged();
    bytes = b.subarray(data, data + e.size);
  } else if (e.method === 8) bytes = inflate(b.subarray(0, data + e.packed), data, e.size);
  else throw new Damaged();
  return utf8(bytes);
}
