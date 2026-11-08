// The connector for tables: a CSV file broken into GQL statements (editor spec §63 connector_files_to_gql,
// connector_mapping_written, connector_derived_kept_apart). It meets the one contract every connector meets.
// - Each row gives one statement for its thing, and one for each link a column makes. Each cites the place, the
//   file's hash, the line the row starts on, the row, and for a link its column.
// - Only by a written mapping, the .gql file beside the table (csv-mapping.ts). With none, the table gives nothing,
//   and a mapping is proposed for a person to apply. It is never guessed at a read.
// - Derived: the statements are made again from the file and its mapping, never written into the note. So the same
//   file and the same mapping always give the same statements, and their hash names them for a cache.
// - Untrusted: the file is read to the limits of csv-read.ts, and a cell is only ever text or a number.
import gs from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';
import type { Connected, Connector, Statement } from './connectors.ts';
import { isNumber, kindOf, mappingOf, mappingPlace, mappingText, nameOf, proposeMapping } from './csv-mapping.ts';
import type { TableMapping } from './csv-mapping.ts';
import { exportRead, isExportTable } from './csv-export-read.ts';
import type { ExportRead } from './csv-export-read.ts';
import { readCsv } from './csv-read.ts';
import type { CsvTable } from './csv-read.ts';
import { readNote } from './drawing.ts';
import { gqlLines } from './export-data-gql.ts';
import { placeKey, readSource } from './sources.ts';
import { word } from './words.ts';

/** A thing's id made from a kind and a cell: `Customer` and `Acme Ltd` give `customer_Acme_Ltd`. */
const idOf = (kind: string, cell: string) => `${kind.toLowerCase()}_${nameOf(cell).replace(/^_/, '')}`;

/** A cell as a value: a number for a measure that reads as one, else its text. */
const valueOf = (cell: string, measure: boolean) => (measure && isNumber(cell) ? String(Number(cell)) : gs.quote(cell));

/**
 * The statements a table gives by its mapping. Each cites the place, `version`, line and row (1-based, the header not
 * counted). A link's also cites its column. A row whose key is empty, or repeats one before, is named under its row.
 */
export function tableStatements(table: CsvTable, mapping: TableMapping, version: string): Statement[] {
  const { place, row: kind } = mapping;
  const index = new Map(table.header.map((h, i) => [h, i]));
  const at = (cells: string[], column: string) => (cells[index.get(column) ?? -1] ?? '').trim();
  const key = mapping.columns.find((c) => c.as === 'key');
  const name = mapping.columns.find((c) => c.as === 'name');
  const seen = new Set<string>();
  const out: Statement[] = [];
  table.rows.forEach((cells, r) => {
    const line = table.lines[r] ?? 0;
    const cite = { place, version, line, row: r + 1 };
    const keyed = key ? at(cells, key.column) : '';
    let id = keyed ? idOf(kind, keyed) : `${kind.toLowerCase()}_row_${r + 1}`;
    if (seen.has(id)) id = `${id}_row_${r + 1}`;
    seen.add(id);
    const props: string[] = [];
    const label = name ? at(cells, name.column) : keyed;
    if (label) props.push(`name: ${gs.quote(label)}`);
    for (const c of mapping.columns) {
      const cell = at(cells, c.column);
      if (!cell || c.as === 'link' || c.as === 'skip' || c.as === 'name') continue;
      props.push(`${nameOf(c.column)}: ${valueOf(cell, c.as === 'measure')}`);
    }
    out.push({ text: `(${id}:${kind}${props.length ? ` {${props.join(', ')}}` : ''})`, cite });
    for (const c of mapping.columns) {
      const cell = at(cells, c.column);
      if (c.as !== 'link' || !cell) continue;
      const to = c.to ?? kindOf(c.column);
      const type = c.type ?? nameOf(c.column).toUpperCase();
      out.push({
        text: `(${id})-[:${type}]->(${idOf(to, cell)}:${to} {name: ${gs.quote(cell)}})`,
        cite: { ...cite, column: c.column },
      });
    }
  });
  return out;
}

/** The statements of ThoughtKnot's own export read back, each citing the row it was on. */
function exportStatements(own: ExportRead, table: CsvTable, place: string, version: string): Statement[] {
  const { things, links } = gqlLines(own.data);
  const cite = (r: number) => ({ place, version, line: table.lines[r] ?? 0, row: r + 1 });
  return [
    ...things.map((text, i) => ({ text, cite: cite(own.thingRows[i] ?? 0) })),
    ...links.map((text, i) => ({ text, cite: cite(own.linkRows[i] ?? 0) })),
  ];
}

/**
 * The connector for a table: a .csv file read with the mapping written beside it. With no mapping, it gives no
 * statements and proposes one (`proposal`, the text of the mapping file) for a person to apply.
 */
export const tableConnector: Connector = {
  kinds: ['table'],
  connect(source, fetched, shared = []) {
    const place = placeKey(source);
    if (!('text' in fetched)) {
      // missing, moved or unreadable is said as for any file; too large is never read
      const said = readSource(source, fetched);
      if ('refused' in said) return said;
      return {
        source,
        why: 'unreadable',
        refused: word('reading.source.place-too-large', { place, graph: source.graph }),
      };
    }
    const table = readCsv(place, fetched.text);
    if ('refused' in table) return { source, why: 'unreadable', refused: table.refused };
    const version = sha256(fetched.text);
    const written = fetched.mapping ? readNote([fetched.mapping], 0, shared).world['mapping'] : undefined;
    const mapping = written ? mappingOf(written, place) : null;
    // ThoughtKnot's own export says itself what each row is, so it reads back with no mapping (format_loss_stated)
    const own = !mapping && isExportTable(table) ? exportRead(table) : null;
    const statements = mapping
      ? tableStatements(table, mapping, version)
      : own
        ? exportStatements(own, table, place, version)
        : [];
    const block = [`// graph: ${source.graph}`, ...statements.map((s) => s.text)].join('\n');
    const reading = readNote([block], 0, shared);
    const read = { source, from: fetched.found, texts: [block], lines: [0], reading };
    const connected: Connected = { source, place, version, statements, read };
    if (own) {
      if (own.faded) connected.note = word('reading.table.faded-not-kept', { place, rows: String(own.faded) });
    } else if (!mapping) {
      connected.proposal = { place: mappingPlace(place), text: mappingText(proposeMapping(place, table)) };
      connected.note = word('reading.table.no-mapping', { place, mapping: mappingPlace(place) });
    } else if (table.uneven.length)
      connected.note = word('reading.table.uneven', { place, rows: String(table.uneven.length) });
    return connected;
  },
};
