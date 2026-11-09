// Importing from a database (editor spec §20, db_import_on_request; §21, settings_db_connections). The database is a
// SQLite file in the vault, so nothing is set up, no password is kept and nothing reaches the network. The core decides
// which files are databases and what an import writes. The host reads the file, and writes only when the user presses Import.
// - An import is written into the note as a GQL block: a copy, as text. It keeps no live link: nothing in it runs again
//   on its own.
// - The file is read by sqlite-read.ts, in plain JavaScript, with no engine and no SQL (Roger, 9 Nov 2026).
// - Each row of the things table is a thing. The person picks its id column, and a kind column if any; the rest are
//   properties.
// - Each row of the links table, when one is picked, is a link. Its from and to columns name its ends. A type column,
//   or one type for all, gives its type. The rest are properties.
import type { Value } from '@thoughtknot/graph-spec';
import { gqlBlock } from './export-data-gql.ts';
import { oneLine } from './export-data-model.ts';
import type { DataLink, DataThing } from './export-data-model.ts';
import { saidDate } from './export-frame.ts';
import type { SqliteTable } from './sqlite-read.ts';
import { word } from './words.ts';

/** Whether a vault file is a SQLite database Import can read, by its ending: .sqlite, .sqlite3 or .db. */
export const isDbFile = (path: string): boolean => /\.(sqlite3?|db)$/i.test(path);

/** A row a query returned: each column's value, by the column's name. */
export type DbRow = Record<string, unknown>;

// a kind and a link's type as the profile reads one
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A column's value as a note can hold it; null for none. A date is its ISO text, anything else its JSON. */
function valueOf(v: unknown): Value | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
  // a blob, such as an image, has no text a note can hold, so it is left out
  if (v instanceof Uint8Array) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  try {
    return JSON.stringify(v) ?? null;
  } catch {
    return null;
  }
}

/** A column's value as the text of an id, a kind or a link's type. It is empty for none, or for no plain value. */
function cell(v: unknown): string {
  const value = valueOf(v);
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/** A row's columns, but those named in `skip`, as properties: a column with no value is left out. */
function propsOf(row: DbRow, skip: string[]): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(row)) {
    const value = valueOf(v);
    if (!skip.includes(k) && NAME.test(k) && value !== null) out[k] = value;
  }
  return out;
}

/** A table's rows as a query would give them: each column's value by the column's name. */
const rowsOf = (t: SqliteTable): DbRow[] =>
  t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));

/**
 * The things of a table picked in the dialog. Each row is a thing, its id from column `id`. Its kind comes from column
 * `kind` when one is picked, and the rest are its properties. Nothing is guessed: only the columns picked have roles.
 */
export function pickedThings(t: SqliteTable, id: string, kind?: string): DbRow[] {
  return rowsOf(t).map((r) => {
    const { [id]: key, ...rest } = r;
    if (kind === undefined) return { ...rest, kind: undefined, id: key };
    const { [kind]: k, ...props } = rest;
    return { ...props, id: key, kind: k };
  });
}

/** The links of a table picked in the dialog: its `from` and `to` columns, and a type column or one type for all. */
export function pickedLinks(t: SqliteTable, from: string, to: string, type: { column: string } | { name: string }) {
  return rowsOf(t).map((r) => {
    const { [from]: a, [to]: b, ...rest } = r;
    if ('name' in type) return { ...rest, from: a, type: type.name, to: b };
    const { [type.column]: kind, ...props } = rest;
    return { ...props, from: a, type: kind, to: b };
  });
}

/** An import: the block to write, or why nothing is written. */
export type DbImported = { block: string } | { refused: string };

/**
 * The rows of an import as one GQL block of graph `graph`, fenced as a note holds it. Its comment says which file it came
 * from, and when. It is refused, writing nothing, for a row with no id or two rows with
 * one id. It is refused for a kind or a link's type that is not a name. It is refused for a link to a thing the things
 * query did not return.
 */
export function importedBlock(
  graph: string,
  things: DbRow[],
  links: DbRow[],
  info: { file: string; date: string },
): DbImported {
  if (!NAME.test(graph)) return { refused: word('import.not-graph-name', { graph }) };
  const data: DataThing[] = [];
  const ids = new Set<string>();
  for (const [i, row] of things.entries()) {
    const key = cell(row.id);
    if (!key) return { refused: word('import.no-id', { row: String(i + 1) }) };
    if (ids.has(key)) return { refused: word('import.same-id', { id: key }) };
    ids.add(key);
    const kind = cell(row.kind);
    if (kind && !NAME.test(kind)) return { refused: word('import.kind-not-name', { kind, id: key }) };
    data.push([key, kind ? [kind] : [], propsOf(row, ['id', 'kind'])]);
  }
  const joined: DataLink[] = [];
  for (const [i, row] of links.entries()) {
    const [from, type, to] = [cell(row.from), cell(row.type), cell(row.to)];
    if (!from || !to || !type) return { refused: word('import.link-columns', { row: String(i + 1) }) };
    if (!NAME.test(type)) return { refused: word('import.type-not-name', { type }) };
    for (const end of [from, to]) if (!ids.has(end)) return { refused: word('import.link-unknown', { id: end }) };
    joined.push([from, type, to, propsOf(row, ['from', 'type', 'to'])]);
  }
  const written = gqlBlock({ graph, things: data, links: joined }, { note: '', date: info.date }).split('\n');
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // the exported comment gives way to one saying it is a copy from the database file, linked to nothing
  written[1] = `// Imported from ${oneLine(info.file)} on ${saidDate(info.date)}: ${count(data.length, 'thing')} and ${count(joined.length, 'link')}, a copy that is not kept in step.`;
  return { block: `\`\`\`gql\n${written.join('\n')}\`\`\`` };
}

/** Note `note` with `block` added at its end, after a blank line. */
export function withImport(note: string, block: string): string {
  // the blank lines at its end are counted back from the end, one pass: never a search that could start at each one
  let end = note.length;
  while (end && note[end - 1] === '\n') end--;
  const body = note.slice(0, end);
  return body ? `${body}\n\n${block}\n` : `${block}\n`;
}
