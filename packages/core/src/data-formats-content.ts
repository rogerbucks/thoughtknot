// A table that is both a node and a graph (editor spec §67, format_content_node, format_graph_from_data; DF1). A CSV
// file is drawn as one node whose content is the table. Through its written mapping (ES§63) it is also things and links.
// - Both views are made from the one file text and cite its hash. So turning one off changes nothing in the other
//   (format_parallel_views).
// - Each row links the file's node to the things it gave, so a person can go from a row to its things and back.
// - Without a mapping the node still draws and the graph is empty, with the mapping proposed (never guessed).
// - The node reports its size, so any layout, 2D or 3D, places it like a thing and knows nothing of the format.
// Host-free and pure.
import { sha256 } from './ai-digest.ts';
import type { Connected } from './connectors.ts';
import { tableConnected } from './csv-connector.ts';
import { readCsv } from './csv-read.ts';
import type { CsvRefusal } from './csv-read.ts';
import type { Source } from './sources.ts';
import { tableNode } from './table-node.ts';
import type { TableNode } from './table-node.ts';

/** One row's link: the file's node, the row (1-based, the header not counted), and a thing the row gave. */
export interface RowLink {
  from: string;
  row: number;
  to: string;
}

/** A table's two views at once, both from one file text. */
export interface TableViews {
  place: string;
  /** The hash of the file's text, which both views cite. */
  version: string;
  /** The id of the node, which a layout places like any thing's. */
  id: string;
  node: TableNode;
  graph: Connected;
  /** Each thing a row gave, with the row, linked from the node. */
  rows: RowLink[];
}

/** The id of the node that draws a file. */
export const nodeIdOf = (place: string): string => `file:${place}`;

/** The ids a statement writes as things, `(id:Kind …)`: a thing's own, and the end a link gives its thing. */
const thingsOf = (text: string): string[] => [...text.matchAll(/\(\s*([A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1] ?? '');

/**
 * The views a CSV file gives. One is its table as a node. The other is its things and links by `mapping`, the text of
 * the mapping written beside it, if any. A file that cannot be read is refused with the reason.
 */
export function tableViews(source: Source, text: string, mapping?: string): TableViews | CsvRefusal {
  const place = source.target;
  const table = readCsv(place, text);
  if ('refused' in table) return table;
  const version = sha256(text);
  const id = nodeIdOf(place);
  const graph = tableConnected(source, { found: place, table, version, mapping });
  const rows: RowLink[] = [];
  const seen = new Set<string>();
  for (const s of graph.statements) {
    if (s.cite.row === undefined) continue;
    for (const thing of thingsOf(s.text)) {
      if (!thing || seen.has(`${s.cite.row} ${thing}`)) continue;
      seen.add(`${s.cite.row} ${thing}`);
      rows.push({ from: id, row: s.cite.row, to: thing });
    }
  }
  return { place, version, id, node: tableNode(id, place, table), graph, rows };
}
