// A table drawn as one node whose content is the table (editor spec §67, format_content_node; wiki/Data-tables-design.md,
// way E). A CSV or a sheet becomes a card that shows its header and its first rows, then a line counting the rest.
// - It is marks, the one picture format every painter draws (drawing-marks.ts). So a 2D view and a 3D view show the
//   same node, and neither needs to know the format.
// - It reports its size, so every layout can place it like any other thing (format_any_layout).
// - A long cell is cut with an ellipsis, and only the first columns are shown. So the node is never unreadable.
// - An empty table still shows its header and says it has no rows. So the node is never blank.
// Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import { LETTER, fitText } from './view-types/fit-text.ts';
import { word } from './words.ts';

/** The table a node shows: its header and its rows of cells, as csv-read.ts gives them. */
export interface NodeTable {
  header: readonly string[];
  rows: readonly (readonly string[])[];
}

/** How much of a table a node shows, at most. */
export interface TableNodeLimit {
  rows: number;
  columns: number;
}

/** The first rows and columns a node shows, before the line counting the rest. */
export const TABLE_NODE_LIMIT: TableNodeLimit = { rows: 8, columns: 6 };

/** The words' size, in the drawing's units. */
const SIZE = 12;
/** A row's height, as a share of the words' size. */
const ROW = 1.6;
/** The room round the table and between columns, as a share of the words' size. */
const PAD = 0.7;
/** The widest a column is, in letters. Longer cells are cut. */
const COLUMN_MOST = 18;
/** The narrowest a column is, in letters. */
const COLUMN_LEAST = 3;

/** A table node: its size, and its marks with its top left corner at 0, 0. */
export interface TableNode {
  width: number;
  height: number;
  /** The rows and columns it leaves out, which its last line counts. */
  more: { rows: number; columns: number };
  marks: DrawMark[];
}

/** The node that draws `table` as the thing `id`, named `name`, showing at most `limit` of it. */
export function tableNode(
  id: string,
  name: string,
  table: NodeTable,
  limit: TableNodeLimit = TABLE_NODE_LIMIT,
): TableNode {
  const columns = Math.min(table.header.length, limit.columns);
  const rows = table.rows.slice(0, limit.rows);
  const more = { rows: table.rows.length - rows.length, columns: table.header.length - columns };
  const lines = [table.header, ...rows];
  const letters = Array.from({ length: columns }, (_, c) =>
    Math.min(COLUMN_MOST, Math.max(COLUMN_LEAST, ...lines.map((r) => [...(r[c] ?? '')].length))),
  );
  const pad = PAD * SIZE;
  const widths = letters.map((n) => n * LETTER * SIZE);
  const tail = tailWords(table.rows.length, more);
  const across = widths.reduce((s, w) => s + w, 0) + pad * Math.max(columns - 1, 0);
  const width = Math.max(across, [...tail].length * LETTER * SIZE, [...name].length * LETTER * SIZE) + 2 * pad;
  const height = (lines.length + 2) * ROW * SIZE + pad;
  const marks: DrawMark[] = [
    { kind: 'box', id, of: id, style: 'thing.table', x: 0, y: 0, width, height, shape: 'round', solid: true },
    { kind: 'box', id: `${id}#head`, style: 'thing.table-head', x: 0, y: 0, width, height: ROW * SIZE, shape: 'rect' },
  ];
  const label = (at: string, text: string, x: number, line: number, style: string, room: number): DrawMark => ({
    kind: 'label',
    id: `${id}#${at}`,
    of: id,
    style,
    x,
    y: (line + 0.7) * ROW * SIZE,
    text: fitText(text, room, SIZE),
    size: SIZE,
    anchor: 'start',
    maxWidth: room,
  });
  marks.push(label('name', name, pad, 0, 'label.table-name', width - 2 * pad));
  let x = pad;
  widths.forEach((w, c) => {
    lines.forEach((cells, r) =>
      marks.push(label(`${r}:${c}`, cells[c] ?? '', x, r + 1, r === 0 ? 'label.table-header' : 'label.table-cell', w)),
    );
    x += w + pad;
  });
  marks.push(label('more', tail, pad, lines.length + 1, 'label.table-more', width - 2 * pad));
  return { width, height, more, marks };
}

/** The last line: how many rows the table has, and what the node leaves out. */
function tailWords(count: number, more: { rows: number; columns: number }): string {
  if (count === 0) return word('reading.table.node-no-rows');
  const parts = [word('reading.table.node-rows', { count })];
  if (more.rows > 0) parts.push(word('reading.table.node-more-rows', { count: more.rows }));
  if (more.columns > 0) parts.push(word('reading.table.node-more-columns', { count: more.columns }));
  return parts.join(' · ');
}

/** The node's marks moved so its centre is at `x`, `y`, as a layout placed it. */
export function placedTableNode(node: TableNode, x: number, y: number): DrawMark[] {
  const dx = x - node.width / 2,
    dy = y - node.height / 2;
  return node.marks.map((m) => (m.kind === 'box' || m.kind === 'label' ? { ...m, x: m.x + dx, y: m.y + dy } : m));
}
