// A SQLite database file read as tables, in plain JavaScript (editor spec §63 connector_files_to_gql, §67
// format_untrusted_files). It reads the file format itself: no engine, no WebAssembly (Roger, 9 Nov 2026).
// - Read-only by design. It walks each table's pages and decodes its rows. Nothing can write, and no SQL is run.
// - Untrusted: every page number is checked, no page is read twice, and a file over the limits is refused whole.
// - Tables only. A WITHOUT ROWID table or a view is listed with why it cannot be read, never read in part.
import { word } from './words.ts';

/** One value of a row: text, a number, a blob's bytes, or nothing. A whole number past 2^53 is kept as its text. */
export type SqliteValue = string | number | Uint8Array | null;

/** A table of the file: its name, its columns, and its rows in rowid order. */
export interface SqliteTable {
  name: string;
  columns: string[];
  rows: SqliteValue[][];
}

/** A table or view of the file's schema, with its root page; `unread` says why it cannot be read. */
export interface SqliteEntry {
  name: string;
  root: number;
  sql: string;
  unread?: string;
}

/** Why a file was not read, as a sentence naming what to do. */
export interface SqliteRefusal {
  why: 'not-sqlite' | 'too-large' | 'too-many-rows' | 'damaged' | 'no-table' | 'unreadable-table';
  refused: string;
}

/** The most a database may hold before it is refused: 64 MB, and 20,000 rows in one table. */
export const SQLITE_LIMITS = { bytes: 64 * 1024 * 1024, rows: 20_000 };

const MAGIC = 'SQLite format 3\0';
// every host has it (browsers, Node, Obsidian on phones); the core is typed without the page's names
declare const TextDecoder: new (label: string) => { decode(b: Uint8Array): string };

class Damaged extends Error {}
class TooMany extends Error {}

/** The file's layout, read from its header. */
interface Layout {
  bytes: Uint8Array;
  view: DataView;
  pageSize: number;
  usable: number;
  pages: number;
  text: (b: Uint8Array) => string;
}

function layoutOf(bytes: Uint8Array): Layout | SqliteRefusal {
  if (bytes.length > SQLITE_LIMITS.bytes)
    return { why: 'too-large', refused: word('reading.sqlite.too-large', { most: String(SQLITE_LIMITS.bytes) }) };
  const head = String.fromCharCode(...bytes.subarray(0, 16));
  if (bytes.length < 100 || head !== MAGIC) return { why: 'not-sqlite', refused: word('reading.sqlite.not-sqlite') };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const raw = view.getUint16(16);
  const pageSize = raw === 1 ? 65536 : raw;
  const usable = pageSize - (bytes[20] ?? 0);
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0 || usable < 480)
    return { why: 'damaged', refused: word('reading.sqlite.damaged') };
  const encoding = view.getUint32(56);
  const decoder = new TextDecoder(encoding === 2 ? 'utf-16le' : encoding === 3 ? 'utf-16be' : 'utf-8');
  const pages = Math.floor(bytes.length / pageSize);
  return { bytes, view, pageSize, usable, pages, text: (b) => decoder.decode(b) };
}

/** A varint at `at`: its value and the bytes it took. Past 2^53 its value is only near. */
function varint(b: Uint8Array, at: number): [number, number] {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const byte = b[at + i];
    if (byte === undefined) throw new Damaged();
    v = v * 128 + (byte & 0x7f);
    if (byte < 0x80) return [v, i + 1];
  }
  const last = b[at + 8];
  if (last === undefined) throw new Damaged();
  return [v * 256 + last, 9];
}

/** The start of page `n` (1-based), checked to be in the file. */
function pageAt(l: Layout, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > l.pages) throw new Damaged();
  return (n - 1) * l.pageSize;
}

/** A cell's whole payload: its local part, then each overflow page in turn. */
function payload(l: Layout, start: number, size: number): Uint8Array {
  const u = l.usable,
    x = u - 35;
  if (size <= x) return l.bytes.subarray(start, start + size);
  const m = Math.floor(((u - 12) * 32) / 255) - 23;
  const k = m + ((size - m) % (u - 4));
  const local = k <= x ? k : m;
  const out = new Uint8Array(size);
  out.set(l.bytes.subarray(start, start + local));
  let filled = local,
    next = l.view.getUint32(start + local);
  const seen = new Set<number>();
  while (filled < size) {
    if (seen.has(next)) throw new Damaged();
    seen.add(next);
    const at = pageAt(l, next);
    const take = Math.min(u - 4, size - filled);
    out.set(l.bytes.subarray(at + 4, at + 4 + take), filled);
    filled += take;
    next = l.view.getUint32(at);
  }
  return out;
}

/** The values of a record: each column's value by its serial type. */
function record(l: Layout, b: Uint8Array): SqliteValue[] {
  const [headSize, n0] = varint(b, 0);
  const types: number[] = [];
  for (let at = n0; at < headSize;) {
    const [t, n] = varint(b, at);
    types.push(t);
    at += n;
  }
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = headSize;
  return types.map((t) => {
    if (t === 0) return null;
    if (t === 8 || t === 9) return t - 8;
    if (t >= 1 && t <= 6) {
      const len = [0, 1, 2, 3, 4, 6, 8][t] ?? 0;
      if (at + len > b.length) throw new Damaged();
      let v = 0n;
      for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(b[at + i] ?? 0);
      if (len && (b[at] ?? 0) & 0x80) v -= 1n << BigInt(len * 8);
      at += len;
      return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
    }
    if (t === 7) {
      if (at + 8 > b.length) throw new Damaged();
      const v = view.getFloat64(at);
      at += 8;
      return v;
    }
    if (t < 12) throw new Damaged();
    const len = Math.floor((t - (t % 2 ? 13 : 12)) / 2);
    if (at + len > b.length) throw new Damaged();
    const part = b.subarray(at, at + len);
    at += len;
    return t % 2 ? l.text(part) : part.slice();
  });
}

/** Each row of the table b-tree at `root`, as its rowid and its values, in rowid order. */
function tableRows(l: Layout, root: number, most: number): [number, SqliteValue[]][] {
  const out: [number, SqliteValue[]][] = [];
  const seen = new Set<number>();
  const walk = (n: number) => {
    if (seen.has(n)) throw new Damaged();
    seen.add(n);
    const base = pageAt(l, n),
      head = n === 1 ? base + 100 : base;
    const kind = l.bytes[head],
      cells = l.view.getUint16(head + 3);
    if (kind !== 0x05 && kind !== 0x0d) throw new Damaged();
    const pointers = head + (kind === 0x05 ? 12 : 8);
    for (let i = 0; i < cells; i++) {
      const cell = base + l.view.getUint16(pointers + 2 * i);
      if (kind === 0x05) {
        walk(l.view.getUint32(cell));
        continue;
      }
      const [size, a] = varint(l.bytes, cell);
      const [rowid, c] = varint(l.bytes, cell + a);
      if (out.length >= most) throw new TooMany();
      out.push([rowid, record(l, payload(l, cell + a + c, size))]);
    }
    if (kind === 0x05) walk(l.view.getUint32(head + 8));
  };
  walk(root);
  return out;
}

/** A name as SQL writes it: quoted with "", `` or [], or bare. */
function unquote(s: string): string {
  const t = s.trim();
  const q = /^"((?:[^"]|"")*)"|^`((?:[^`]|``)*)`|^\[([^\]]*)\]|^'((?:[^']|'')*)'/.exec(t);
  if (q) return (q[1] ?? q[2]?.replace(/``/g, '`') ?? q[3] ?? q[4] ?? '').replace(/""/g, '"').replace(/''/g, "'");
  return /^[^\s(,]+/.exec(t)?.[0] ?? '';
}

/** The parts of a list split at its commas, leaving those inside brackets or quotes. */
function topLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0,
    quote = '',
    from = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? '';
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '[') quote = ']';
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(s.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(s.slice(from));
  return parts;
}

const CONSTRAINT = /^(constraint|primary|unique|check|foreign)\b/i;

/** A CREATE TABLE's columns, the one that is the rowid (INTEGER PRIMARY KEY), and whether it has no rowid. */
export function columnsOf(sql: string): { columns: string[]; rowid: number; withoutRowid: boolean } {
  const open = sql.indexOf('('),
    close = sql.lastIndexOf(')');
  const defs = open < 0 || close < open ? [] : topLevel(sql.slice(open + 1, close)).map((d) => d.trim());
  const columns: string[] = [],
    types: string[] = [];
  let rowid = -1,
    keyed: string[] = [];
  for (const d of defs) {
    if (CONSTRAINT.test(d)) {
      const key = /^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(d);
      if (key?.[1]) keyed = topLevel(key[1]).map((k) => unquote(k.replace(/\s+(asc|desc)\s*$/i, '')));
      continue;
    }
    const name = unquote(d);
    const rest = d
      .trim()
      .slice(d.trim().indexOf(name) + name.length)
      .replace(/^["`\]']/, '');
    columns.push(name);
    types.push(/^\s*(\w+)/.exec(rest)?.[1]?.toUpperCase() ?? '');
    if (/^\s*integer\b/i.test(rest) && /\bprimary\s+key\b(?!\s+desc)/i.test(rest)) rowid = columns.length - 1;
  }
  const only = keyed.length === 1 ? columns.indexOf(keyed[0] ?? '') : -1;
  if (rowid < 0 && only >= 0 && types[only] === 'INTEGER') rowid = only;
  return { columns, rowid, withoutRowid: /\)\s*without\s+rowid\s*;?\s*$/i.test(sql) };
}

/** The file's tables and views, by name, each with why it cannot be read when it cannot. */
export function sqliteEntries(bytes: Uint8Array): SqliteEntry[] | SqliteRefusal {
  const l = layoutOf(bytes);
  if ('refused' in l) return l;
  try {
    return schemaOf(l);
  } catch (e) {
    return refusalOf(e);
  }
}

function schemaOf(l: Layout): SqliteEntry[] {
  const out: SqliteEntry[] = [];
  for (const [, v] of tableRows(l, 1, SQLITE_LIMITS.rows)) {
    const [type, name, , root, sql] = v;
    if ((type !== 'table' && type !== 'view') || typeof name !== 'string' || name.startsWith('sqlite_')) continue;
    const text = typeof sql === 'string' ? sql : '';
    const entry: SqliteEntry = { name, root: typeof root === 'number' ? root : 0, sql: text };
    if (type === 'view') entry.unread = word('reading.sqlite.view', { name });
    else if (/^create\s+virtual\b/i.test(text)) entry.unread = word('reading.sqlite.virtual', { name });
    else if (columnsOf(text).withoutRowid) entry.unread = word('reading.sqlite.without-rowid', { name });
    out.push(entry);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function refusalOf(e: unknown): SqliteRefusal {
  if (e instanceof TooMany)
    return {
      why: 'too-many-rows',
      refused: word('reading.sqlite.too-many-rows', { most: String(SQLITE_LIMITS.rows) }),
    };
  if (e instanceof Damaged || e instanceof RangeError)
    return { why: 'damaged', refused: word('reading.sqlite.damaged') };
  throw e;
}

/** The table `name` of the file, every row of it; or why it cannot be read. */
export function sqliteTable(bytes: Uint8Array, name: string): SqliteTable | SqliteRefusal {
  const l = layoutOf(bytes);
  if ('refused' in l) return l;
  try {
    const entry = schemaOf(l).find((e) => e.name === name);
    if (!entry) return { why: 'no-table', refused: word('reading.sqlite.no-table', { name }) };
    if (entry.unread) return { why: 'unreadable-table', refused: entry.unread };
    const { columns, rowid } = columnsOf(entry.sql);
    const rows = tableRows(l, entry.root, SQLITE_LIMITS.rows).map(([id, values]) =>
      // a column added later is missing from older rows; the rowid column is stored as its rowid
      columns.map((_, i) => (i === rowid ? id : (values[i] ?? null))),
    );
    return { name, columns, rows };
  } catch (e) {
    return refusalOf(e);
  }
}
