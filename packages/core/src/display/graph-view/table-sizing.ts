// The size and look of a graph drawn as a table (spec §15, table_resize, table_look). A column is resized by dragging
// the grip at the end of its head. A row is resized by the grip under its number. A mouse, a pen or a finger drags. A double click
// on a grip fits the column to its words, or puts the row back. Alt+Shift and an arrow key does the same from the
// keyboard (table-keys.ts). The bar above the table sets its look on screen: rows striped in two colours, and the
// rows' height. Fit columns puts every size back. The look is the viewer's own, kept on this device. The sizes are
// kept while the app is open, so the table drawn again is as it was left (never disorient the user).

import { word } from '@thoughtknot/core';
import type { WordKey } from '@thoughtknot/core';

/** How the table looks, the viewer's own. */
export interface TableLook {
  stripes: boolean;
  rows: RowHeight;
}
/** How tall the table's rows are drawn. */
export type RowHeight = 'short' | 'medium' | 'tall';
const HEIGHTS: readonly RowHeight[] = ['short', 'medium', 'tall'];
/** Every element of `el` that `sel` names, as an array. */
const all = (el: Element, sel: string): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>(sel));
const DEFAULT_LOOK: TableLook = { stripes: true, rows: 'medium' };
const LOOK_KEY = 'thoughtknot-table-look';

/** The narrowest a column or a row is made, in CSS pixels, so that it can always be found and widened again. */
const MIN_COL_PX = 40,
  MIN_ROW_PX = 20;
/** How far one key press resizes a column or a row, in CSS pixels. */
export const COL_STEP_PX = 16,
  ROW_STEP_PX = 8;
/** Roughly how wide one character is, when the words cannot be measured. */
const CHAR_PX = 7.5,
  CELL_PAD_PX = 24;

/** The look as kept on this device; the default where none is kept, or it cannot be read. */
export function tableLook(): TableLook {
  try {
    const kept = JSON.parse(activeWindow.localStorage?.getItem(LOOK_KEY) ?? 'null') as Partial<TableLook> | null;
    return {
      stripes: typeof kept?.stripes === 'boolean' ? kept.stripes : DEFAULT_LOOK.stripes,
      rows: HEIGHTS.includes(kept?.rows as RowHeight) ? (kept?.rows as RowHeight) : DEFAULT_LOOK.rows,
    };
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

function keepLook(look: TableLook): void {
  try {
    activeWindow.localStorage?.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // a private window or a host without storage: the look lasts as long as the table
  }
}

/** Shows `look` on the area that scrolls. */
function showLook(scroll: HTMLElement, look: TableLook): void {
  scroll.toggleClass('is-striped', look.stripes);
  for (const h of HEIGHTS) scroll.toggleClass(`thoughtknot-rows-${h}`, look.rows === h);
}

/** The sizes the viewer gave, by table (its heads), while the app is open: the columns' widths and each row's height. */
interface Sizes {
  cols: number[] | null;
  rows: Map<string, number>;
}
const SIZES = new Map<string, Sizes>();

/** What a table is known by across drawings: its heads. */
const keyOf = (table: HTMLElement): string =>
  all(table, 'thead th[data-col]')
    .map((th) => th.textContent ?? '')
    .join('\u0001');
const sizesOf = (table: HTMLElement): Sizes => {
  const key = keyOf(table);
  return SIZES.get(key) ?? SIZES.set(key, { cols: null, rows: new Map() }).get(key)!;
};

/** What a row is known by: its thing or its link. */
const rowKey = (tr: HTMLElement): string => tr.getAttribute('data-key') ?? `link:${tr.getAttribute('data-link') ?? ''}`;

const colsOf = (table: HTMLElement): HTMLElement[] => all(table, 'col[data-col]');
const headsOf = (table: HTMLElement): HTMLElement[] => all(table, 'thead th[data-col]');

/** Sets each column's width, and the table's as their sum, so a column can be made narrower than its words. */
function setWidths(table: HTMLElement, widths: number[] | null): void {
  sizesOf(table).cols = widths;
  table.toggleClass('is-sized', !!widths);
  colsOf(table).forEach((col, i) => col.setCssProps({ '--thoughtknot-col-w': widths ? `${widths[i]}px` : 'auto' }));
  table.setCssProps({ '--thoughtknot-table-w': widths ? `${Math.round(widths.reduce((a, b) => a + b, 0))}px` : '' });
}

/** Each column's width as drawn now: where the table's sizes are first taken over from its words. */
const drawnWidths = (table: HTMLElement): number[] =>
  sizesOf(table).cols ?? headsOf(table).map((th) => Math.max(MIN_COL_PX, th.getBoundingClientRect().width));

/** Makes column `i` of `table` `by` pixels wider (narrower when negative), or exactly `to` wide. */
export function resizeColumn(table: HTMLElement, i: number, change: { by?: number; to?: number }): void {
  const widths = [...drawnWidths(table)];
  if (i < 0 || i >= widths.length) return;
  widths[i] = Math.max(MIN_COL_PX, Math.round(change.to ?? (widths[i] ?? MIN_COL_PX) + (change.by ?? 0)));
  setWidths(table, widths);
}

/** Makes row `tr` `by` pixels taller (shorter when negative); with `by` null, puts it back to the table's height. */
export function resizeRow(tr: HTMLElement, by: number | null): void {
  const table = tr.closest<HTMLElement>('table');
  if (!table) return;
  const rows = sizesOf(table).rows,
    key = rowKey(tr);
  if (by === null) rows.delete(key);
  else rows.set(key, Math.max(MIN_ROW_PX, Math.round((rows.get(key) ?? tr.getBoundingClientRect().height) + by)));
  showRow(tr, rows.get(key));
}

function showRow(tr: HTMLElement, height: number | undefined): void {
  tr.toggleClass('is-sized-row', height !== undefined);
  tr.setCssProps({ '--thoughtknot-row-own': height === undefined ? '' : `${height}px` });
}

/** How wide the words of column `i` are, at their widest, measured as drawn where the page can. */
function fitWidth(table: HTMLElement, i: number): number {
  const cells = [
    headsOf(table)[i],
    ...Array.from(table.querySelectorAll<HTMLElement>('tbody tr')).map((tr) => all(tr, 'td')[i]),
  ].filter((c): c is HTMLElement => !!c);
  const ctx = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  const font = cells[1] ?? cells[0];
  if (ctx && font) ctx.font = activeWindow.getComputedStyle?.(font)?.font ?? ctx.font;
  const width = (s: string) => (ctx ? ctx.measureText(s).width : s.length * CHAR_PX);
  return Math.max(MIN_COL_PX, ...cells.map((c) => width(c.textContent ?? '') + CELL_PAD_PX));
}

/** Whether the table reads from right to left, where a drag to the left widens a column. */
const rtl = (el: HTMLElement): boolean => el.closest('[dir]')?.getAttribute('dir') === 'rtl';

/** Binds the grips of `tables`, all in `scroll`, and puts back the sizes given them before. */
export function bindSizing(scroll: HTMLElement, tables: HTMLElement[]): void {
  for (const table of tables) {
    const kept = sizesOf(table);
    if (kept.cols) setWidths(table, kept.cols);
    for (const tr of Array.from(table.querySelectorAll<HTMLElement>('tbody tr')))
      showRow(tr, kept.rows.get(rowKey(tr)));
  }
  let drag: { id: number; grip: HTMLElement; from: number; start: number } | null = null;
  scroll.addEventListener('pointerdown', (e: PointerEvent) => {
    const grip = (e.target as Element | null)?.closest?.<HTMLElement>('.thoughtknot-col-grip, .thoughtknot-row-grip');
    if (!grip || e.button > 0) return;
    e.preventDefault(); // no text chosen, no focus taken, no scroll begun
    const col = grip.hasClass('thoughtknot-col-grip');
    const table = grip.closest<HTMLElement>('table'),
      th = grip.closest<HTMLElement>('th'),
      tr = grip.closest<HTMLElement>('tr');
    if (!table || !th || !tr) return;
    const i = Number(th.getAttribute('data-col'));
    const start = col ? (drawnWidths(table)[i] ?? MIN_COL_PX) : tr.getBoundingClientRect().height;
    drag = { id: e.pointerId, grip, from: col ? e.clientX : e.clientY, start };
    grip.setPointerCapture?.(e.pointerId);
    scroll.addClass('is-resizing');
  });
  scroll.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    const { grip, from, start } = drag,
      table = grip.closest<HTMLElement>('table'),
      tr = grip.closest<HTMLElement>('tr');
    if (!table || !tr) return;
    if (grip.hasClass('thoughtknot-col-grip')) {
      const moved = (e.clientX - from) * (rtl(table) ? -1 : 1);
      resizeColumn(table, Number(grip.closest('th')?.getAttribute('data-col')), { to: start + moved });
    } else {
      const rows = sizesOf(table).rows;
      rows.set(rowKey(tr), Math.max(MIN_ROW_PX, Math.round(start + e.clientY - from)));
      showRow(tr, rows.get(rowKey(tr)));
    }
  });
  const end = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag.grip.releasePointerCapture?.(e.pointerId);
    drag = null;
    scroll.removeClass('is-resizing');
  };
  scroll.addEventListener('pointerup', end);
  scroll.addEventListener('pointercancel', end);
  // a double click on a grip: the column fitted to its words, or the row put back
  scroll.addEventListener('dblclick', (e: MouseEvent) => {
    const grip = (e.target as Element | null)?.closest?.<HTMLElement>('.thoughtknot-col-grip, .thoughtknot-row-grip');
    const table = grip?.closest<HTMLElement>('table'),
      tr = grip?.closest<HTMLElement>('tr');
    if (!grip || !table || !tr) return;
    e.preventDefault();
    if (grip.hasClass('thoughtknot-row-grip')) return resizeRow(tr, null);
    const i = Number(grip.closest('th')?.getAttribute('data-col'));
    resizeColumn(table, i, { to: fitWidth(table, i) });
  });
}

/** Puts every column and row of the tables in `scroll` back to the size their words give them. */
function fitAll(scroll: HTMLElement): void {
  for (const table of all(scroll, 'table')) {
    setWidths(table, null);
    sizesOf(table).rows.clear();
    for (const tr of Array.from(table.querySelectorAll<HTMLElement>('tbody tr'))) showRow(tr, undefined);
  }
}

/** The bar of the table's look, above the area `scroll` that it sets: stripes, the rows' height, and Fit columns. */
export function renderTableBar(wrap: HTMLElement, scroll: HTMLElement): HTMLElement {
  const look = tableLook();
  showLook(scroll, look);
  const bar = wrap.createDiv({
    cls: 'thoughtknot-table-bar',
    attr: { role: 'toolbar', 'aria-label': word('table.look') },
  });
  wrap.insertBefore(bar, scroll);
  const pressed = (b: HTMLElement, on: boolean) => b.setAttribute('aria-pressed', String(on));
  const set = (change: Partial<TableLook>) => {
    Object.assign(look, change);
    keepLook(look);
    showLook(scroll, look);
    pressed(stripes, look.stripes);
    for (const [h, b] of heights) pressed(b, look.rows === h);
  };
  const stripes = bar.createEl('button', { text: word('table.stripes'), attr: { type: 'button' } });
  stripes.addEventListener('click', () => set({ stripes: !look.stripes }));
  const group = bar.createDiv({
    cls: 'thoughtknot-table-heights',
    attr: { role: 'group', 'aria-label': word('table.row-height') },
  });
  group.createSpan({ cls: 'thoughtknot-quiet', text: word('table.row-height'), attr: { 'aria-hidden': 'true' } });
  const heights = HEIGHTS.map((h) => {
    const b = group.createEl('button', { text: word(`table.rows.${h}` as WordKey), attr: { type: 'button' } });
    b.addEventListener('click', () => set({ rows: h }));
    return [h, b] as const;
  });
  const fit = bar.createEl('button', { text: word('table.fit-columns'), attr: { type: 'button' } });
  fit.addEventListener('click', () => fitAll(scroll));
  set({});
  return bar;
}
