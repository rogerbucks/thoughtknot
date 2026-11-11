// The connector for a table of a SQLite database: `· FROM Data/shop.sqlite#orders` (ES§63
// connector_files_to_gql, connector_mapping_written; ES§67 format_untrusted_files). It meets the one contract.
// - Read in plain JavaScript (sqlite-read.ts): no engine, no WebAssembly, no SQL. Nothing in the file can run or be
//   written.
// - The table is read as a CSV file's rows are, by the mapping written beside the database, `shop.orders.mapping.gql`.
//   With none, it gives no statements and proposes one for a person to apply. Nothing is guessed at a read.
// - Each statement cites the place, the table's hash and the row. A blob has no text a note can hold, so it is left out.
import { sha256 } from './ai-digest.ts';
import type { Connector } from './connectors.ts';
import { tableConnected } from './csv-connector.ts';
import type { CsvTable } from './csv-read.ts';
import { databasePlace, placeKey, readSource } from './sources.ts';
import { sqliteTable } from './sqlite-read.ts';
import type { SqliteTable, SqliteValue } from './sqlite-read.ts';
import { word } from './words.ts';

/** A value as a table's cell: its text, or nothing for a null or a blob. */
const cellOf = (v: SqliteValue): string => (v === null || v instanceof Uint8Array ? '' : String(v));

/** A database's table as the rows a CSV file gives: its columns the header, each row cited by its number. */
export function asCsvTable(t: SqliteTable): CsvTable {
  return {
    header: t.columns,
    rows: t.rows.map((r) => r.map(cellOf)),
    lines: t.rows.map((_, i) => i + 1),
    delimiter: ',',
    quotedEmpty: new Set(),
    uneven: [],
  };
}

/** The connector for `file#table`, a table of a SQLite database, read by the mapping beside it. */
export const databaseConnector: Connector = {
  kinds: ['database'],
  connect(source, fetched, shared = []) {
    const place = placeKey(source);
    const at = databasePlace(place);
    if (!('bytes' in fetched) || !at) {
      const said = 'bytes' in fetched ? null : readSource(source, fetched);
      if (said && 'refused' in said) return said;
      return {
        source,
        why: 'unreadable',
        refused: word('reading.source.place-too-large', { place, graph: source.graph }),
      };
    }
    const read = sqliteTable(fetched.bytes, at.table);
    if ('refused' in read) return { source, why: 'unreadable', refused: read.refused };
    const table = asCsvTable(read);
    const version = sha256(JSON.stringify([table.header, table.rows]));
    return tableConnected(source, { found: fetched.found, table, version, mapping: fetched.mapping }, shared);
  },
};
