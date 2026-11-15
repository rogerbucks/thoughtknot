// The objects of a PDF file, in plain JavaScript (ES§63 connector_files_to_gql, ES§67 format_untrusted_files). No
// library, no WebAssembly and no network.
// - The file is read as Latin-1 text. Every `N G obj` is found by scanning, so the cross-reference table is never
//   trusted: a file whose table lies is read as it really is. Objects packed in object streams are unpacked.
// - Only FlateDecode is read, with no predictor. A stream in any other form is given as unreadable, not guessed at.
// - Untrusted: nesting, objects, and what a stream inflates to are all limited. Nothing in the file is ever run.
import { Damaged, TooBig, inflateZlib } from './zip-read.ts';

/** A PDF name, a reference to an object, a string (its bytes as Latin-1), or a keyword such as an operator. */
export type PdfValue =
  | number
  | boolean
  | null
  | { n: string }
  | { r: number }
  | { s: string }
  | { op: string }
  | PdfValue[]
  | Map<string, PdfValue>;

const WS = ' \t\r\n\f\0';
const DELIM = '()<>[]{}/%';
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const REFERENCE = /\s+(\d{1,10})\s+R(?![^\s/<>[\]()%])/y;

/** The index of the first character from `i` that is not white space or inside a comment. */
export function skip(s: string, i: number): number {
  for (;;) {
    while (i < s.length && WS.includes(s[i] ?? '')) i++;
    if (s[i] !== '%') return i;
    while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
  }
}

function literal(s: string, from: number): [string, number] {
  const named: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
  let [out, depth, i] = ['', 1, from + 1];
  while (i < s.length) {
    const c = s[i++] ?? '';
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return [out, i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = s[i++] ?? '';
    if (e in named) out += named[e];
    else if (e >= '0' && e <= '7') {
      let o = e;
      while (o.length < 3 && (s[i] ?? '') >= '0' && (s[i] ?? '') <= '7') o += s[i++];
      out += String.fromCharCode(parseInt(o, 8) & 255);
    } else if (e === '\r') {
      if (s[i] === '\n') i++;
    } else if (e !== '\n') out += e;
  }
  throw new Damaged();
}

/** The next value at or after `i`, and where it ends; null at the end. A keyword comes back as `{ op }`. */
export function parseValue(s: string, from: number, depth = 0): [PdfValue, number] | null {
  if (depth > 32) throw new Damaged();
  const i = skip(s, from);
  const c = s[i];
  if (c === undefined) return null;
  if (c === '(') {
    const [text, end] = literal(s, i);
    return [{ s: text }, end];
  }
  if (c === '<' && s[i + 1] !== '<') {
    const end = s.indexOf('>', i);
    if (end < 0) throw new Damaged();
    let hex = s.slice(i + 1, end).replace(/\s+/g, '');
    if (hex.length % 2) hex += '0';
    if (/[^0-9a-fA-F]/.test(hex)) throw new Damaged();
    return [{ s: hex.replace(/../g, (h) => String.fromCharCode(parseInt(h, 16))) }, end + 1];
  }
  if (c === '<') {
    const dict = new Map<string, PdfValue>();
    let j = i + 2;
    for (;;) {
      j = skip(s, j);
      if (s.startsWith('>>', j)) return [dict, j + 2];
      const key = parseValue(s, j, depth + 1);
      if (!key || typeof key[0] !== 'object' || key[0] === null || !('n' in key[0])) throw new Damaged();
      const value = parseValue(s, key[1], depth + 1);
      if (!value) throw new Damaged();
      if (!dict.has(key[0].n)) dict.set(key[0].n, value[0]);
      j = value[1];
    }
  }
  if (c === '[') {
    const list: PdfValue[] = [];
    let j = i + 1;
    for (;;) {
      j = skip(s, j);
      if (s[j] === ']') return [list, j + 1];
      const item = parseValue(s, j, depth + 1);
      if (!item) throw new Damaged();
      list.push(item[0]);
      j = item[1];
    }
  }
  let j = i + 1;
  if (c === '/') while (j < s.length && !WS.includes(s[j] ?? '') && !DELIM.includes(s[j] ?? '')) j++;
  else if (DELIM.includes(c)) return [{ op: c }, j];
  else while (j < s.length && !WS.includes(s[j] ?? '') && !DELIM.includes(s[j] ?? '')) j++;
  const token = s.slice(i, j);
  if (c === '/')
    return [
      { n: token.slice(1).replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) },
      j,
    ];
  if (NUMBER.test(token)) {
    if (/^\d{1,10}$/.test(token)) {
      REFERENCE.lastIndex = j;
      const ref = REFERENCE.exec(s);
      if (ref) return [{ r: Number(token) }, REFERENCE.lastIndex];
    }
    return [Number(token), j];
  }
  if (token === 'true' || token === 'false') return [token === 'true', j];
  if (token === 'null') return [null, j];
  return [{ op: token }, j];
}

/**
 * What a PDF holds: its text, each object by number, and where each stream's raw bytes are in the text. `spent` is
 * the count of characters its streams have given so far, each time one was read, and `most` is the most they may give.
 */
export interface PdfFile {
  text: string;
  objects: Map<number, PdfValue>;
  streams: Map<number, [number, number]>;
  spent?: number;
  most?: number;
}

/**
 * The most a PDF may hold before it is refused: its bytes, its objects, what one stream inflates to, and its pages.
 * `total` is the most all its streams may give together, counting a stream again each time it is read. So a small
 * file that names one stream many times cannot make the reader work without end.
 */
export const PDF_LIMITS = {
  bytes: 32 * 1024 * 1024,
  objects: 500_000,
  stream: 64 * 1024 * 1024,
  pages: 5000,
  total: 64 * 1024 * 1024,
};

/** The Latin-1 text of the bytes, made a piece at a time. */
export function latin1(b: Uint8Array): string {
  const pieces: string[] = [];
  for (let i = 0; i < b.length; i += 8192) pieces.push(String.fromCharCode(...b.subarray(i, i + 8192)));
  return pieces.join('');
}

/** The value of `v` with each reference followed (at most a few steps, so a loop gives null). */
export function resolve(f: PdfFile, v: PdfValue | undefined): PdfValue {
  for (let n = 0; n < 16; n++) {
    if (v === undefined) return null;
    if (typeof v === 'object' && v !== null && 'r' in v) v = f.objects.get(v.r);
    else return v;
  }
  return null;
}

/** The dictionary `v` stands for, or null. */
export function dictOf(f: PdfFile, v: PdfValue | undefined): Map<string, PdfValue> | null {
  const r = resolve(f, v);
  return r instanceof Map ? r : null;
}

/** The name `v` stands for, or an empty string. */
export const nameOf = (f: PdfFile, v: PdfValue | undefined): string => {
  const r = resolve(f, v);
  return typeof r === 'object' && r !== null && 'n' in r ? r.n : '';
};

/** The number `v` stands for, or `fallback`. */
export const numOf = (f: PdfFile, v: PdfValue | undefined, fallback = 0): number => {
  const r = resolve(f, v);
  return typeof r === 'number' ? r : fallback;
};

/** The stream's text, counted against the most all streams may give together; past that the file is too big. */
function counted(f: PdfFile, text: string): string {
  f.spent = (f.spent ?? 0) + text.length;
  if (f.spent > (f.most ?? PDF_LIMITS.total)) throw new TooBig();
  return text;
}

/**
 * The text of the stream of object `num`, inflated; null when it is in a form this reader does not read. Each read
 * counts against `PDF_LIMITS.total`, and a file that passes it is refused as too big.
 */
export function streamText(f: PdfFile, num: number, limit = PDF_LIMITS.stream): string | null {
  const at = f.streams.get(num);
  const dict = dictOf(f, f.objects.get(num));
  if (!at || !dict) return null;
  const filters = [resolve(f, dict.get('Filter'))].flat().filter((x) => x !== null);
  const names = filters.map((x) => nameOf(f, x));
  if (names.some((n) => n !== 'FlateDecode' && n !== 'Fl') || names.length > 1) return null;
  if (dict.get('DecodeParms') !== undefined && dictOf(f, dict.get('DecodeParms'))?.get('Predictor') !== 1) {
    const parms = [resolve(f, dict.get('DecodeParms'))].flat();
    if (parms.some((p) => p !== null && numOf(f, dictOf(f, p)?.get('Predictor'), 1) > 1)) return null;
  }
  const raw = new Uint8Array(at[1] - at[0]);
  for (let i = 0; i < raw.length; i++) raw[i] = f.text.charCodeAt(at[0] + i) & 255;
  if (names.length === 0) return raw.length > limit ? null : counted(f, latin1(raw));
  try {
    return counted(f, latin1(inflateZlib(raw, 0, raw.length, limit)));
  } catch (e) {
    if (e instanceof Damaged) return null;
    throw e;
  }
}

/**
 * Every object of the file, found by scanning; the stream objects' contents are unpacked into more. `total` is the
 * most its streams may give together.
 */
export function readObjects(bytes: Uint8Array, total = PDF_LIMITS.total): PdfFile {
  if (bytes.length > PDF_LIMITS.bytes) throw new TooBig();
  const text = latin1(bytes);
  const f: PdfFile = { text, objects: new Map(), streams: new Map(), spent: 0, most: total };
  const found = /(\d{1,10})\s+\d{1,5}\s+obj\b/g;
  for (let m = found.exec(text); m; m = found.exec(text)) {
    if (f.objects.size >= PDF_LIMITS.objects) throw new TooBig();
    const parsed = parseValue(text, m.index + m[0].length);
    if (!parsed) break;
    const num = Number(m[1]);
    f.objects.set(num, parsed[0]);
    found.lastIndex = Math.max(found.lastIndex, parsed[1]);
    const k = skip(text, parsed[1]);
    if (parsed[0] instanceof Map && text.startsWith('stream', k)) {
      let start = k + 6;
      if (text[start] === '\r') start++;
      if (text[start] === '\n') start++;
      let end = text.indexOf('endstream', start);
      if (end < 0) throw new Damaged();
      found.lastIndex = end + 9;
      if (text[end - 1] === '\n') end--;
      if (text[end - 1] === '\r') end--;
      f.streams.set(num, [start, Math.max(start, end)]);
    }
  }
  for (const [num, v] of [...f.objects]) {
    if (!(v instanceof Map) || nameOf(f, v.get('Type')) !== 'ObjStm') continue;
    const body = streamText(f, num);
    if (body === null) continue;
    const [count, first] = [numOf(f, v.get('N')), numOf(f, v.get('First'))];
    if (count > PDF_LIMITS.objects) throw new TooBig();
    const head = body.slice(0, first).split(/\s+/).filter(Boolean).map(Number);
    // Each object starts after the one before it ends, as the format says. So the body is read once, however many
    // numbers the head gives to one place.
    let end = 0;
    for (let k = 0; k < count; k++) {
      const [id, off] = [head[2 * k], head[2 * k + 1]];
      if (id === undefined || off === undefined || Number.isNaN(id + off) || f.objects.has(id)) continue;
      if (first + off < end) continue;
      if (f.objects.size >= PDF_LIMITS.objects) throw new TooBig();
      const inner = parseValue(body, first + off);
      if (!inner) continue;
      f.objects.set(id, inner[0]);
      end = inner[1];
    }
  }
  return f;
}
