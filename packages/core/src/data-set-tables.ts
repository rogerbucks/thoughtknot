// The tables a graph's data sets show (editor spec §67, format_content_node). Each `DataSet` thing's content is read
// from its place by the host. Kept apart from table-source.ts so the drawing never imports the readers.
// - A .csv file, a sheet of a workbook (`book.xlsx#Sheet1`) or a table of a database (`shop.sqlite#orders`) shows as
//   its table.
// - A .txt file, a Word document or a PDF shows as a page: its first lines, then a line counting the rest.
// So a box is never blank or unreadable, in 2D and in 3D alike, which both read the same drawing.
import type { Graph } from '@thoughtknot/graph-spec';
import { readCsv } from './csv-read.ts';
import { asCsvTable } from './database-connector.ts';
import { dataSetsOf } from './data-set-reference.ts';
import { documentText, isDocumentPlace } from './document-text.ts';
import { databasePlace, workbookPlace } from './sources.ts';
import { sqliteTable } from './sqlite-read.ts';
import type { NodeTable } from './table-node.ts';
import { word } from './words.ts';
import { workbookTable } from './xlsx-read.ts';

/** What a host gives for a place: a text file's text, a binary file's bytes, or null when it cannot be read. */
export type DataSetFile = string | Uint8Array | null;

/** Whether a place's file is read as bytes by its host: a workbook, a database or a document. */
export const readAsBytes = (place: string): boolean =>
  Boolean(workbookPlace(place) || databasePlace(place) || isDocumentPlace(place));

/** A text as a page: its lines that hold anything, each a row of one column. */
function pageOf(text: string): NodeTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return { header: [word('reading.table.node-page')], rows: lines.map((l) => [l.trim()]), page: true };
}

/** The content of the file at `place`, as a node shows it, or null when it is no table or page that can be read. */
export function nodeTableOf(place: string, file: DataSetFile): NodeTable | null {
  if (file === null) return null;
  const wb = workbookPlace(place),
    db = databasePlace(place);
  if (typeof file !== 'string') {
    if (wb) {
      const t = workbookTable(file, wb.sheet);
      return 'refused' in t ? null : { header: t.header, rows: t.rows };
    }
    if (db) {
      const t = sqliteTable(file, db.table);
      return 'refused' in t ? null : { header: t.columns, rows: asCsvTable(t).rows };
    }
    if (isDocumentPlace(place)) {
      const t = documentText(file, place);
      return 'refused' in t ? null : pageOf(t.text);
    }
    return null;
  }
  if (/\.txt$/i.test(place)) return pageOf(file);
  const table = readCsv(place, file);
  return 'header' in table ? { header: table.header, rows: table.rows } : null;
}

/**
 * The tables of a graph's data sets, by thing id, each read by `read` from its place. A place that cannot be read
 * shows none, nor does one that is no table or page. Its box keeps its name, and the problem is the source's to say.
 */
export async function dataSetTables(
  graph: Graph | undefined,
  read: (place: string) => Promise<DataSetFile>,
): Promise<[string, NodeTable][]> {
  const refs = graph ? dataSetsOf(graph) : [];
  const read1 = async (id: string, place: string): Promise<[string, NodeTable][]> => {
    const table = nodeTableOf(place, await read(place));
    return table ? [[id, table]] : [];
  };
  return (await Promise.all(refs.map((r) => read1(r.id, r.place)))).flat();
}
