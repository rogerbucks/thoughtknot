// A graph drawn as a table (spec §15, diagram_type_set). It is a plain table the plugin draws, never Graphviz, from the
// core's `tableOf`. It has a row for each thing, with its kind and properties, and one for each link. Each row is
// reached and named as a box or a link of a drawing is. So tapping, the details and the inspector work as in every
// other type (type_one_way_to_work). It works as a data table does (table_grid_navigation). It scrolls by itself, by
// wheel, trackpad and finger. Its headings and first column stay in sight. The keys move from cell to cell
// (table-keys.ts). Its columns and rows can be resized, and its look is set on screen (table-sizing.ts). The card's zoom,
// or two fingers (table-pinch.ts), makes its words larger or smaller. Drawn again, it keeps its place (table-place.ts).
import { word } from '@thoughtknot/core';
import type { DiagramTable } from '@thoughtknot/core';
import type { Target } from './taps';
import { bindTableKeys } from './table-keys';
import { bindSizing, renderTableBar } from './table-sizing';
import { bindPinch } from './table-pinch';
import { keepPlace } from './table-place';
import { bindCellEdits, type CellWrite } from './table-edit';
import { bindTableTotals } from './table-totals-row';

/** What a table is handed by its card. It opens a row as a tap does, and writes a cell where one can be written. */
export interface TableHands {
  open?: (t: Target) => void;
  edit?: CellWrite;
}

/** The heads of the links' table. */
const linkHeads = (): string[] => [word('table.from'), word('table.link'), word('table.to'), word('table.properties')];

/** Roughly how wide one character of the table is, and how tall a row, in CSS pixels: its size before it is on the page. */
const CHAR_PX = 7.5,
  ROW_PX = 30,
  CELL_PAD_PX = 20,
  WIDEST_CHARS = 40,
  GUTTER_PX = 40;

/** The table's natural size, estimated from its words, for the card's frame before the table is on the page. */
export function tableSize(t: DiagramTable): { width: number; height: number } {
  const across = (rows: string[][]) =>
    (rows[0] ?? []).reduce(
      (w, _, i) =>
        w + Math.min(WIDEST_CHARS, Math.max(...rows.map((r) => (r[i] ?? '').length))) * CHAR_PX + CELL_PAD_PX,
      GUTTER_PX,
    );
  const links = [linkHeads(), ...t.links.map((l) => [...l.cells, l.properties])];
  return {
    width: Math.ceil(Math.max(across([t.columns, ...t.rows.map((r) => r.cells)]), t.links.length ? across(links) : 0)),
    // its rows, its heads, and the bar of its look above them
    height: (t.rows.length + 4 + (t.links.length ? t.links.length + 2 : 0)) * ROW_PX,
  };
}

/** One row of a table to draw: what it is known by, how it is named to a screen reader, and its cells. */
interface GridRow {
  attr: Record<string, string>;
  label: string;
  cells: string[];
}

/**
 * One table of the grid: a gutter of row numbers, then a column for each head. Each head sorts its column and has a
 * grip to resize it; each row's number has a grip to resize the row. Every cell can take the focus, one at a time.
 */
function gridTable(parent: HTMLElement, label: string, heads: string[], rows: GridRow[]): HTMLTableElement {
  const table = parent.createEl('table', {
    attr: { role: 'grid', 'aria-label': label, 'aria-rowcount': String(rows.length + 1) },
  });
  const cols = table.createEl('colgroup');
  cols.createEl('col', { cls: 'thoughtknot-gutter-col' });
  heads.forEach((_, i) => cols.createEl('col', { attr: { 'data-col': String(i) } }));
  const head = table.createEl('thead').createEl('tr', { attr: { role: 'row' } });
  head.createEl('th', {
    cls: 'thoughtknot-row-head',
    attr: { role: 'columnheader', 'aria-label': word('table.row'), tabindex: '-1' },
  });
  heads.forEach((h, i) => {
    const th = head.createEl('th', {
      attr: { role: 'columnheader', scope: 'col', 'data-col': String(i), tabindex: '-1', 'aria-sort': 'none' },
    });
    th.createSpan({ cls: 'thoughtknot-head-text', text: h });
    th.createSpan({
      cls: 'thoughtknot-col-grip',
      attr: { 'aria-hidden': 'true', title: word('table.resize-column', { name: h }) },
    });
  });
  const body = table.createEl('tbody');
  rows.forEach((r, n) => {
    const tr = body.createEl('tr', {
      attr: { ...r.attr, role: 'row', tabindex: '-1', 'aria-selected': 'false', 'aria-label': r.label },
    });
    const num = tr.createEl('th', {
      cls: 'thoughtknot-row-head',
      attr: { role: 'rowheader', scope: 'row', tabindex: '-1' },
    });
    num.createSpan({ cls: 'thoughtknot-row-num', text: String(n + 1) });
    num.createSpan({
      cls: 'thoughtknot-row-grip',
      attr: { 'aria-hidden': 'true', title: word('table.resize-row', { row: String(n + 1) }) },
    });
    for (const c of r.cells) tr.createEl('td', { text: c, attr: { role: 'gridcell', tabindex: '-1' } });
  });
  return table;
}

/**
 * The table, put in the card's viewport: the bar of its look, then the things, then the links, in one area that
 * scrolls. `hands.open` opens a row's thing or link as a tap does, for the keys that move the selection along the
 * rows. With `hands.edit`, a thing's cells can be typed in.
 */
export function renderTable(viewport: HTMLElement, t: DiagramTable, hands: TableHands = {}): HTMLElement {
  const wrap = viewport.createDiv({ cls: ['thoughtknot-table', 'thoughtknot-grid'] });
  const scroll = wrap.createDiv({ cls: 'thoughtknot-table-scroll' });
  renderTableBar(wrap, scroll); // above the area that scrolls, so it stays in sight
  const things = gridTable(
    scroll,
    word('table.things'),
    t.columns,
    t.rows.map((r) => ({
      attr: { 'data-key': r.key },
      label: `${r.cells[1] ?? ''}: ${r.cells[0] ?? ''}`,
      cells: r.cells,
    })),
  );
  if (t.rows.length) bindTableTotals(wrap, scroll, things, t); // the filters and the Total row (§57, table_view)
  const tables = [things];
  if (t.links.length)
    tables.push(
      gridTable(
        scroll,
        word('table.links'),
        linkHeads(),
        t.links.map((l) => ({
          attr: { 'data-link': String(l.index) },
          label: word('table.link-row', { cells: l.cells.join(' ') }),
          cells: [...l.cells, l.properties],
        })),
      ),
    );
  // the first cell of the first thing is where Tab comes in
  things.querySelector<HTMLElement>('tbody td')?.setAttribute('tabindex', '0');
  bindSizing(scroll, tables);
  bindTableKeys(scroll, tables, hands.open);
  if (hands.edit) bindCellEdits(scroll, t.columns, hands.edit); // its cells typed in (§72, edit_cells)
  bindPinch(scroll);
  keepPlace(scroll); // after sorting, so the row with the focus is found where it now is
  return wrap;
}
