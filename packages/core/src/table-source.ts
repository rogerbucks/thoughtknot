// A data set drawn as its table, in the drawing Graphviz lays out (editor spec §67, format_content_node; way E of
// wiki/Data-tables-design.md). A `DataSet` thing's box shows the table's header, its first rows and a line counting
// the rest, below its name. Graphviz sizes the box to fit, so every layout places it, and the 3D view reads the same
// drawing. The rows shown are those the table card shows (table-node.ts), which takes its limit and last line from here.
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
import { STYLE } from './layout.ts';
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

/** The widest a cell is, in letters. A longer cell is cut with an ellipsis. */
const CELL_LETTERS = 18;

/** The last line: how many rows the table has, and what the node leaves out. */
export function tableTail(count: number, more: { rows: number; columns: number }): string {
  if (count === 0) return word('reading.table.node-no-rows');
  const parts = [word('reading.table.node-rows', { count })];
  if (more.rows > 0) parts.push(word('reading.table.node-more-rows', { count: more.rows }));
  if (more.columns > 0) parts.push(word('reading.table.node-more-columns', { count: more.columns }));
  return parts.join(' · ');
}

/** `text` cut to `most` letters, its last one an ellipsis when it is longer. */
function cut(text: string, most: number): string {
  const letters = [...text];
  return letters.length <= most ? text : `${letters.slice(0, most - 1).join('')}…`;
}

/** How a box's line opens its label, a table: `  "<key>" [label=<<table `. */
const BOX_LABEL = '[label=<<table ';

/** One table row of cells, each escaped and cut to fit. A header row is bold. */
function row(cells: readonly string[], columns: number, header: boolean): string {
  const size = STYLE.kind_font_size;
  const cell = (text: string) => {
    const shown = GraphLayout.escape(cut(text, CELL_LETTERS));
    return `<td align="left"><font point-size="${size}">${header ? `<b>${shown}</b>` : shown}</font></td>`;
  };
  return `<tr>${Array.from({ length: columns }, (_, c) => cell(cells[c] ?? '')).join('')}</tr>`;
}

/** The rows a box's label gains for `table`: a grid of its header and first rows, then the line counting the rest. */
export function tableRows(table: NodeTable, limit: TableNodeLimit = TABLE_NODE_LIMIT): string {
  const columns = Math.max(1, Math.min(table.header.length, limit.columns));
  const shown = table.rows.slice(0, limit.rows);
  const more = { rows: table.rows.length - shown.length, columns: table.header.length - columns };
  const grid =
    `<table border="0" cellborder="1" cellspacing="0" cellpadding="2">` +
    `${row(table.header, columns, true)}${shown.map((r) => row(r, columns, false)).join('')}</table>`;
  const tail = GraphLayout.escape(tableTail(table.rows.length, more));
  return (
    `<tr><td cellpadding="0" height="${STYLE.caption_gap}"></td></tr><tr><td cellpadding="0">${grid}</td></tr>` +
    `<tr><td cellpadding="0"><font point-size="${STYLE.kind_font_size}"><i>${tail}</i></font></td></tr>`
  );
}

/** The Graphviz source `dot` with each box of `tables` showing its table below its text. None: `dot` unchanged. */
export function tableSource(dot: string, tables: readonly (readonly [string, NodeTable])[] | undefined): string {
  if (!tables?.length) return dot;
  const boxes = new Map(tables.map(([key, table]) => [`  "${key}" ${BOX_LABEL}`, table]));
  return dot
    .split('\n')
    .map((line) => {
      const at = line.indexOf(BOX_LABEL);
      const table = at < 0 ? undefined : boxes.get(line.slice(0, at + BOX_LABEL.length));
      if (!table) return line;
      const end = line.indexOf('</table>>');
      return `${line.slice(0, end)}${tableRows(table)}${line.slice(end)}`;
    })
    .join('\n');
}
