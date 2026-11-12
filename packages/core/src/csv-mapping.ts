// How a table's rows and columns become things, links and properties (editor spec §63, connector_mapping_written).
// The mapping is graph data written in a .gql file beside the table: `Data/sales.csv` is mapped by
// `Data/sales.mapping.gql`. A first read proposes one (`proposeMapping`), and a person applies it by saving that file
// (§17). It is never guessed again at each read: with no mapping written, a table gives no statements.
//
// ```gql
// // graph: mapping
// (sales:DataSet {place: 'Data/sales.csv', row: 'Sale'})
// (order_id:Column {name: 'order_id', as: 'key', at: 1})
// (sales)-[:COLUMN]->(order_id)
// ```
//
// Each column has a role, its `as`. It is the row's `key` or its `name`. Or a `measure`, a number to total. Or a
// `dimension`, a way to group. Or a `property`, a `link` to another thing (`type`, `to`), or `skip`.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import type { CsvTable } from './csv-read.ts';
import { word } from './words.ts';
import { databasePlace, workbookPlace } from './sources.ts';

/** What a column of the table becomes. */
export type ColumnRole = 'key' | 'name' | 'measure' | 'dimension' | 'property' | 'link' | 'skip';

/** One column's place in the mapping: its header, its role, and for a link its type and the kind it reaches. */
export interface ColumnMap {
  column: string;
  as: ColumnRole;
  /** For a link: the link's type, such as BOUGHT_BY. */
  type?: string;
  /** For a link: the kind of the thing it reaches, such as Customer. */
  to?: string;
  /** For a measure: its unit, such as GBP. */
  unit?: string;
}

/** A table's mapping: the place it maps, the kind each row's thing is, and each column's role, in the header's order. */
export interface TableMapping {
  place: string;
  row: string;
  columns: ColumnMap[];
}

const ROLES: readonly ColumnRole[] = ['key', 'name', 'measure', 'dimension', 'property', 'link', 'skip'];
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A header or a cell as a name GQL reads: letters, digits and underscores, never starting with a digit. */
export function nameOf(text: string): string {
  // underscores taken off each end by counting, never by a pattern that could run slow on a long cell
  const joined = text.trim().replace(/[^A-Za-z0-9_]+/g, '_');
  let start = 0,
    end = joined.length;
  while (start < end && joined[start] === '_') start++;
  while (end > start && joined[end - 1] === '_') end--;
  const word = joined.slice(start, end);
  if (!word) return '_';
  return /^[0-9]/.test(word) ? `_${word}` : word;
}

/** A kind's name from a file's: `Data/daily sales.csv` gives `DailySales`. */
export function kindOf(place: string): string {
  // a database's table or a workbook's sheet is named by it, never the file: `shop.sqlite#customers` gives Customers
  const stem =
    databasePlace(place)?.table ??
    workbookPlace(place)?.sheet ??
    (place.split('/').at(-1) ?? place).replace(/\.[^.]*$/, '');
  const kind = stem
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join('');
  return NAME.test(kind) ? kind : `Row${kind}`;
}

/** The place of a table's mapping: beside the table, `Data/sales.csv` mapped by `Data/sales.mapping.gql`. */
export function mappingPlace(place: string): string {
  // a database's table or a workbook's sheet has its own: `shop.sqlite#orders` is mapped by `shop.orders.mapping.gql`
  const db = databasePlace(place);
  const wb = workbookPlace(place);
  const [file, table] = db ? [db.file, `.${db.table}`] : wb ? [wb.file, `.${wb.sheet}`] : [place, ''];
  return `${file.replace(/\.[^./]*$/, '')}${table}.mapping.gql`;
}

/** Whether a cell reads as a number: an optional sign, digits, an optional point and an exponent, nothing else. */
export const isNumber = (cell: string): boolean => /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(cell.trim());

/**
 * A mapping proposed from a table's first read, for a person to apply. The key is the first column whose cells are
 * all filled and all different, preferring one called id or ending in _id. A column called name or title is the name.
 * A column of numbers is a measure, one with few different texts a dimension, and the rest are properties. No column
 * is proposed as a link: only a person says what a cell reaches.
 */
export function proposeMapping(place: string, table: CsvTable): TableMapping {
  const cells = (i: number) => table.rows.map((r) => (r[i] ?? '').trim());
  const unique = (i: number) => {
    const c = cells(i);
    return c.length > 0 && c.every((x) => x !== '') && new Set(c).size === c.length;
  };
  const named = (re: RegExp) => table.header.findIndex((h, i) => re.test(h) && unique(i));
  let key = named(/^(id|key)$|_id$|\bid$/i);
  if (key < 0) key = table.header.findIndex((_, i) => unique(i));
  const name = table.header.findIndex((h, i) => i !== key && /^(name|title|label)$/i.test(h.trim()));
  const columns = table.header.map((column, i): ColumnMap => {
    if (i === key) return { column, as: 'key' };
    if (i === name) return { column, as: 'name' };
    const filled = cells(i).filter((x) => x !== '');
    if (filled.length && filled.every(isNumber)) return { column, as: 'measure' };
    const kinds = new Set(filled).size;
    if (filled.length >= 4 && kinds <= Math.max(2, Math.floor(filled.length / 4))) return { column, as: 'dimension' };
    return { column, as: 'property' };
  });
  return { place, row: kindOf(place), columns };
}

/** A mapping written as graph data, the text of the .gql file beside the table. */
export function mappingText(m: TableMapping): string {
  const set = nameOf(kindOf(m.place)).toLowerCase() || 'table';
  const used = new Set([set]);
  const lines = [
    '// graph: mapping',
    `// ${word('reading.table.mapping-said', { place: m.place, row: m.row })}`,
    `(${set}:DataSet {place: ${gs.quote(m.place)}, row: ${gs.quote(m.row)}})`,
  ];
  m.columns.forEach((c, i) => {
    let id = `col_${nameOf(c.column).toLowerCase()}`;
    while (used.has(id)) id = `${id}_${i + 1}`;
    used.add(id);
    const props = [`name: ${gs.quote(c.column)}`, `as: ${gs.quote(c.as)}`, `at: ${i + 1}`];
    if (c.type) props.push(`type: ${gs.quote(c.type)}`);
    if (c.to) props.push(`to: ${gs.quote(c.to)}`);
    if (c.unit) props.push(`unit: ${gs.quote(c.unit)}`);
    lines.push(`(${id}:Column {${props.join(', ')}})`, `(${set})-[:COLUMN]->(${id})`);
  });
  return `${lines.join('\n')}\n`;
}

/** The mapping for `place` read from the graph its file holds, or null when it maps no such table. */
export function mappingOf(graph: Graph, place: string): TableMapping | null {
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const set = [...graph.nodes].find(([, [labels, p]]) => labels.has('DataSet') && p['place'] === place);
  if (!set) return null;
  const [setId, [, setProps]] = set;
  const columns = graph.edges
    .filter(([from, type]) => from === setId && type === 'COLUMN')
    .flatMap(([, , to]) => {
      const node = graph.nodes.get(to);
      if (!node?.[0].has('Column')) return [];
      const p = node[1];
      const column = text(p['name']);
      const as = text(p['as']) as ColumnRole | undefined;
      if (column === undefined || !as || !ROLES.includes(as)) return [];
      const at = typeof p['at'] === 'number' ? p['at'] : Number.MAX_SAFE_INTEGER;
      const map: ColumnMap = { column, as };
      for (const k of ['type', 'to', 'unit'] as const) if (text(p[k])) map[k] = text(p[k]);
      return [{ at, map }];
    })
    .sort((a, b) => a.at - b.at)
    .map((c) => c.map);
  return { place, row: text(setProps['row']) ?? kindOf(place), columns };
}
