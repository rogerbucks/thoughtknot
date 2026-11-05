// A CSV file read as a table (editor spec §63 connector_files_to_gql, §67 format_untrusted_files). It reads RFC 4180:
// cells split by a comma, quoted cells holding commas, quotes and line breaks, a doubled quote inside a quoted cell.
// It also takes a semicolon or a tab between cells, when the header line has more of them than commas.
// - Untrusted: nothing in a cell is run. A file over the limits is refused with its reason, never read in part. Those
//   limits are its bytes, rows, columns and the length of one cell. So is a file holding a NUL, which is no text.
// - Cited: each row keeps the line of the file it starts on, so a statement made from it can say where it came from.
// - Loss stated: a row with more cells than the header is kept, and its extra cells are listed in `uneven`.
import { READ_LIMITS } from './layout-limits.ts';
import { word } from './words.ts';

/** The most a CSV file may hold before it is refused. */
export interface CsvLimits {
  bytes: number;
  rows: number;
  columns: number;
  cell: number;
}

/** The limits a table is read to: the bytes a note's graph may hold, 20,000 rows, 500 columns, 10,000 characters a cell. */
export const CSV_LIMITS: CsvLimits = { bytes: READ_LIMITS.bytes, rows: 20_000, columns: 500, cell: 10_000 };

/** A CSV file read as a table: its header, its rows and the line (1-based) each row starts on. */
export interface CsvTable {
  header: string[];
  rows: string[][];
  lines: number[];
  /** The character between cells: a comma, a semicolon or a tab. */
  delimiter: ',' | ';' | '\t';
  /** Rows (0-based) holding more cells than the header has columns, with how many more. */
  uneven: { row: number; extra: number }[];
}

/** Why a CSV file was not read, as a sentence naming it and what to do. */
export interface CsvRefusal {
  why:
    'too-large' | 'too-many-rows' | 'too-many-columns' | 'cell-too-long' | 'unclosed-quote' | 'no-header' | 'not-text';
  refused: string;
}

/** The character between cells: whichever of comma, semicolon or tab the header line holds most, outside quotes. */
function delimiterOf(text: string): CsvTable['delimiter'] {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c in counts) counts[c as keyof typeof counts]++;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  return ',';
}

/** Whether a row holds nothing: no cell, or one empty cell, as a blank line reads. */
const blank = (row: string[]) => row.length === 0 || (row.length === 1 && row[0] === '');

/** The CSV file `place` read as a table, or why not. Its text is untrusted: limits are kept and nothing is run. */
export function readCsv(place: string, text: string, limits: CsvLimits = CSV_LIMITS): CsvTable | CsvRefusal {
  const refuse = (why: CsvRefusal['why'], values: Record<string, string> = {}): CsvRefusal => ({
    why,
    refused: word(`reading.table.${why}`, { place, ...values }),
  });
  if (text.length > limits.bytes) return refuse('too-large', { most: String(limits.bytes) });
  if (text.includes('\u0000')) return refuse('not-text');
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const delimiter = delimiterOf(body);
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  let i = 0;
  let widest = 0;
  const endCell = () => {
    row.push(cell);
    widest = Math.max(widest, row.length);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (!blank(row)) {
      rows.push(row);
      lines.push(start);
    }
    row = [];
  };
  while (i < body.length) {
    const c = body[i] as string;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        cell += c;
      }
      i++;
    } else if (c === '"' && cell === '') {
      quoted = true;
      i++;
    } else if (c === delimiter) {
      endCell();
      i++;
    } else if (c === '\r' || c === '\n') {
      endRow();
      i += c === '\r' && body[i + 1] === '\n' ? 2 : 1;
      start = ++line;
    } else {
      cell += c;
      i++;
    }
    if (cell.length > limits.cell) return refuse('cell-too-long', { line: String(line), most: String(limits.cell) });
    if (widest > limits.columns) return refuse('too-many-columns', { most: String(limits.columns) });
    if (rows.length > limits.rows + 1) return refuse('too-many-rows', { most: String(limits.rows) });
  }
  if (quoted) return refuse('unclosed-quote', { line: String(start) });
  endRow();
  if (widest > limits.columns) return refuse('too-many-columns', { most: String(limits.columns) });
  if (rows.length > limits.rows + 1) return refuse('too-many-rows', { most: String(limits.rows) });
  const [header, ...data] = rows;
  if (!header || header.every((h) => h.trim() === '')) return refuse('no-header');
  const uneven = data.flatMap((r, row) => (r.length > header.length ? [{ row, extra: r.length - header.length }] : []));
  return { header: header.map((h) => h.trim()), rows: data, lines: lines.slice(1), delimiter, uneven };
}
