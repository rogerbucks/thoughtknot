// A sheet of an Excel workbook after FROM (ES§63 connector_files_to_gql, connector_mapping_written; ES§67
// format_untrusted_files): `· FROM Data/book.xlsx#Sheet1`. It meets the one contract, as a SQLite table does.
// - Read in plain JavaScript (xlsx-read.ts): no library, no WebAssembly. Nothing in the file can run or be written.
// - The sheet is read as a CSV file's rows are, by the mapping written beside the workbook, `book.Sheet1.mapping.gql`.
//   With none, it gives no statements and proposes one for a person to apply. Nothing is guessed at a read.
// - Each statement cites the place, the sheet's hash and the sheet's own row number.
import { sha256 } from './ai-digest.ts';
import type { Connector } from './connectors.ts';
import { tableConnected } from './csv-connector.ts';
import { placeKey, readSource, workbookPlace } from './sources.ts';
import { word } from './words.ts';
import { workbookTable } from './xlsx-read.ts';

/** The connector for `file#sheet`, a sheet of an Excel workbook, read by the mapping beside it. */
export const workbookConnector: Connector = {
  kinds: ['workbook'],
  connect(source, fetched, shared = []) {
    const place = placeKey(source);
    const at = workbookPlace(place);
    if (!('bytes' in fetched) || !at) {
      const said = 'bytes' in fetched ? null : readSource(source, fetched);
      if (said && 'refused' in said) return said;
      return {
        source,
        why: 'unreadable',
        refused: word('reading.source.place-too-large', { place, graph: source.graph }),
      };
    }
    const table = workbookTable(fetched.bytes, at.sheet);
    if ('refused' in table) return { source, why: 'unreadable', refused: table.refused };
    const version = sha256(JSON.stringify([table.header, table.rows]));
    return tableConnected(source, { found: fetched.found, table, version, mapping: fetched.mapping }, shared);
  },
};
