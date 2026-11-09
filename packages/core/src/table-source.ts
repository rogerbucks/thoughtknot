// A data set drawn as its table, in the drawing Graphviz lays out (editor spec §67, format_content_node; way E of
// wiki/Data-tables-design.md). A `DataSet` thing's box shows the table's header, its first rows and a line counting
// the rest, below its name. Graphviz sizes the box to fit, so every layout places it, and the 3D view reads the same
// drawing. The rows shown are those the table card shows (table-node.ts).
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
import { STYLE } from './layout.ts';
import type { NodeTable, TableNodeLimit } from './table-node.ts';
import { TABLE_NODE_LIMIT, tableTail } from './table-node.ts';
import { fitText } from './view-types/fit-text.ts';

/** The widest a cell is, in letters. A longer cell is cut with an ellipsis. */
const CELL_LETTERS = 18;

/** How a box's line opens its label, a table: `  "<key>" [label=<<table `. */
const BOX_LABEL = '[label=<<table ';

/** One table row of cells, each escaped and cut to fit. A header row is bold. */
function row(cells: readonly string[], columns: number, header: boolean): string {
  const size = STYLE.kind_font_size;
  const cell = (text: string) => {
    const shown = GraphLayout.escape(fitText(text, CELL_LETTERS, 1));
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
