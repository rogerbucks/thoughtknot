// A short named reference to a table of data, and pointers inside it (editor spec §52, data_set_reference). It is way
// C of wiki/Data-tables-design.md, which Roger picked on 6 Nov 2026.
// - A graph names a data set with a `DataSet` thing: `(sales:DataSet {place: 'Data/sales.csv', version: '…'})`. The
//   note holds the reference, never the data (text_is_the_store).
// - A pointer reaches inside it: `Data/sales.csv#row=12&col=amount`. It names a row by its number or its key, a
//   column, a cell, or a measure to total.
// - A version a reference names, that the file no longer has, is said, never hidden: the data changed since.
// Host-free and pure.
import type { Graph } from '@thoughtknot/graph-spec';
import type { TableMapping } from './csv-mapping.ts';
import { isNumber } from './csv-mapping.ts';
import type { CsvTable } from './csv-read.ts';
import { word } from './words.ts';

/** A data set a graph names: the thing's id, the file's place, and the version it was read at, when it says one. */
export interface DataSetRef {
  id: string;
  place: string;
  version?: string;
}

/** A pointer inside a data set: a row by number (from 1) or by key, a column, or a measure to total. */
export interface DataPointer {
  place: string;
  row?: number;
  key?: string;
  col?: string;
  measure?: string;
}

/** What a pointer reaches: one cell, a row by its header, a column's cells, or a measure's total. */
export type PointedAt =
  | { kind: 'cell'; value: string; row: number; col: string }
  | { kind: 'row'; value: Record<string, string>; row: number }
  | { kind: 'column'; value: string[]; col: string }
  | { kind: 'measure'; value: number; col: string };

/** The data sets a graph names: each `DataSet` thing with a text `place`, in the graph's order. */
export function dataSetsOf(graph: Graph): DataSetRef[] {
  return [...graph.nodes].flatMap(([id, [labels, p]]) => {
    if (!labels.has('DataSet') || typeof p['place'] !== 'string') return [];
    const ref: DataSetRef = { id, place: p['place'] };
    if (typeof p['version'] === 'string') ref.version = p['version'];
    return [ref];
  });
}

/** A pointer read from its text, such as `Data/sales.csv#row=12&col=amount`, or null when it is not one. */
export function pointerOf(text: string): DataPointer | null {
  const at = text.indexOf('#');
  if (at <= 0) return null;
  const p: DataPointer = { place: text.slice(0, at) };
  for (const pair of text.slice(at + 1).split('&')) {
    const eq = pair.indexOf('=');
    const k = pair.slice(0, eq);
    let v: string;
    try {
      v = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return null;
    }
    if (eq <= 0) return null;
    if (k === 'row' && /^[1-9][0-9]*$/.test(v)) p.row = Number(v);
    else if (k === 'key' || k === 'col' || k === 'measure') p[k] = v;
    else return null;
  }
  const one = [p.row, p.key, p.measure].filter((x) => x !== undefined).length;
  if (one > 1 || (p.measure !== undefined && p.col !== undefined) || (one === 0 && p.col === undefined)) return null;
  return p;
}

/** A pointer as its text, the inverse of `pointerOf`. */
export function pointerText(p: DataPointer): string {
  const parts = (['row', 'key', 'col', 'measure'] as const).flatMap((k) =>
    p[k] === undefined ? [] : [`${k}=${encodeURIComponent(String(p[k]))}`],
  );
  return `${p.place}#${parts.join('&')}`;
}

/**
 * What `p` reaches in `table`, or the words saying why it reaches nothing. A key is looked up in the mapping's key
 * column, and a measure must be a column the mapping marks as one.
 */
export function pointedAt(table: CsvTable, mapping: TableMapping | null, p: DataPointer): PointedAt | string {
  const column = (name: string) => table.header.indexOf(name);
  const missing = (what: 'row' | 'column' | 'measure', name: string) =>
    word(`reading.table.no-${what}`, { place: p.place, name });
  const roleOf = (role: string) => mapping?.columns.find((c) => c.as === role)?.column;
  let r = -1;
  if (p.row !== undefined) r = p.row <= table.rows.length ? p.row - 1 : -1;
  if (p.key !== undefined) {
    const k = column(roleOf('key') ?? '');
    r = k < 0 ? -1 : table.rows.findIndex((cells) => (cells[k] ?? '').trim() === p.key);
  }
  if ((p.row !== undefined || p.key !== undefined) && r < 0) return missing('row', String(p.row ?? p.key));
  if (p.measure !== undefined) {
    const c = column(p.measure);
    const isMeasure = mapping?.columns.some((m) => m.column === p.measure && m.as === 'measure');
    if (c < 0 || !isMeasure) return missing('measure', p.measure);
    const cells = table.rows.map((cells) => (cells[c] ?? '').trim()).filter((x) => x !== '' && isNumber(x));
    return { kind: 'measure', value: cells.reduce((s, x) => s + Number(x), 0), col: p.measure };
  }
  const c = p.col === undefined ? -1 : column(p.col);
  if (p.col !== undefined && c < 0) return missing('column', p.col);
  const cells = table.rows[r];
  if (cells && p.col !== undefined) return { kind: 'cell', value: cells[c] ?? '', row: r + 1, col: p.col };
  if (cells)
    return { kind: 'row', value: Object.fromEntries(table.header.map((h, i) => [h, cells[i] ?? ''])), row: r + 1 };
  return { kind: 'column', value: table.rows.map((cells) => cells[c] ?? ''), col: p.col ?? '' };
}

/** The words saying a data set changed since the version its reference names, or null when it has not. */
export function changedSince(ref: DataSetRef, version: string): string | null {
  return ref.version === undefined || ref.version === version
    ? null
    : word('reading.table.changed-since', { place: ref.place, name: ref.id });
}
