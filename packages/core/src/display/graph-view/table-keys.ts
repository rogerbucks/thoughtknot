// The keys, the focus and the order of a graph drawn as a table (spec §15, table_grid_navigation, table_sort). It is
// worked as a spreadsheet is. One cell has the focus, and Tab comes in to it and goes on past the table. The arrow keys
// move it a cell at a time, and with Control or Command to the table's edge. Home and End go to the start and end of
// the row, and with Control or Command to the first and last cell. Page Up and Page Down move a screenful. With a
// row's details open, moving to another row opens its details instead, as a list does. Enter or Space on a head, or a
// click on it, sorts by that column, then the other way, then back as written. Control or Command and C copies the
// cell. Alt+Shift and an arrow key resizes the column or the row (table-sizing.ts). Each move keeps the cell in sight.
import type { Target } from './taps';
import { targetAt } from './taps';
import { COL_STEP_PX, ROW_STEP_PX, resizeColumn, resizeRow } from './table-sizing';

/** A cell that can take the focus: a head, a row's number, or a cell of data. */
const CELL = 'th[data-col], td, th.thoughtknot-row-head';
/** How many rows Page Up and Page Down move where the page cannot say how many show. */
const PAGE_ROWS = 10;

const all = (el: Element, sel: string): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>(sel));
const cellsOf = (tr: Element): HTMLElement[] =>
  Array.from(tr.children).filter((c): c is HTMLElement => c.matches(CELL));

/** Whether an event came from the table's own controls: its bar, its heads or a grip, which a drawing's taps leave be. */
export function onTableControl(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.(
    '.thoughtknot-table-bar, .thoughtknot-grid thead, .thoughtknot-row-grip',
  );
}

/**
 * Whether the table scrolls by itself for this event, so the card's zoom must leave it alone. That is a press, a move,
 * a lift or a double click in it, and the wheel without Control or Command, which scrolls it. The wheel with them, a
 * trackpad's pinch, and the zoom's keys still zoom its words.
 */
export function tableScrolls(e: Event, ev: { kind: string; ctrl?: boolean; meta?: boolean }): boolean {
  if (!(e.target as Element | null)?.closest?.('.thoughtknot-table-scroll')) return false;
  if (ev.kind === 'wheel') return !ev.ctrl && !ev.meta;
  return ev.kind !== 'key';
}

/** Whether the table already took a key, so the card does nothing more with it. */
export const tableTookKey = (e: KeyboardEvent): boolean =>
  e.defaultPrevented && !!(e.target as Element | null)?.closest?.('.thoughtknot-table-scroll');

/** Binds the keys, the focus and the sorting of `tables`, in `scroll`. `open` opens a row as a tap does. */
export function bindTableKeys(scroll: HTMLElement, tables: HTMLTableElement[], open?: (t: Target) => void): void {
  const rows = () => tables.flatMap((t) => all(t, 'tr')).filter((r) => !r.hidden && !r.closest('tfoot'));
  let column = 1; // the column the focus is in, kept as it moves up and down past shorter rows
  const make = (cell: HTMLElement) => {
    for (const c of all(scroll, '[tabindex="0"]')) if (c !== cell) c.setAttribute('tabindex', '-1');
    cell.setAttribute('tabindex', '0');
  };
  scroll.addEventListener('focusin', (e: FocusEvent) => {
    const el = e.target as HTMLElement;
    // a row given the focus, as Find gives it: its cell in the column the focus was in
    if (el.matches?.('tr')) {
      const cell = cellsOf(el)[Math.min(column, cellsOf(el).length - 1)];
      cell?.focus({ preventScroll: true });
      cell?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const cell = el.closest?.<HTMLElement>(CELL);
    if (!cell) return;
    make(cell);
    column = cellsOf(cell.parentElement as Element).indexOf(cell);
  });
  const go = (from: HTMLElement, ri: number, ci: number) => {
    const list = rows(),
      tr = list[Math.max(0, Math.min(list.length - 1, ri))];
    if (!tr) return;
    const cells = cellsOf(tr),
      cell = cells[Math.max(0, Math.min(cells.length - 1, ci))];
    if (!cell) return;
    cell.focus();
    cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    column = ci;
    // with a row's details open, the details follow the focus to the next row, as a list's do
    const was = from.closest('tr');
    if (open && was !== tr && was?.classList.contains('is-selected')) {
      const t = targetAt(tr);
      if (t) open(t);
    }
  };
  /** How many rows show at once, for Page Up and Page Down. */
  const page = (tr: HTMLElement) => {
    const h = tr.getBoundingClientRect().height;
    return h > 0 && scroll.clientHeight > 0 ? Math.max(1, Math.floor(scroll.clientHeight / h) - 1) : PAGE_ROWS;
  };
  scroll.addEventListener('keydown', (e: KeyboardEvent) => {
    const cell = (e.target as Element | null)?.closest?.<HTMLElement>(CELL);
    const tr = cell?.parentElement as HTMLElement | null;
    if (!cell || !tr) return;
    const list = rows(),
      ri = list.indexOf(tr),
      cells = cellsOf(tr),
      ci = cells.indexOf(cell);
    const edge = e.ctrlKey || e.metaKey,
      back = cell.closest('[dir]')?.getAttribute('dir') === 'rtl' ? 1 : -1; // Left goes back, but from right to left
    const take = (then: () => void) => {
      e.preventDefault();
      then();
    };
    // Alt+Shift and an arrow resizes the column or the row the focus is in
    if (e.altKey && e.shiftKey && e.key.startsWith('Arrow')) {
      const table = cell.closest<HTMLElement>('table'),
        col = Number(cell.getAttribute('data-col') ?? Number.NaN);
      const i = Number.isNaN(col) ? ci - 1 : col;
      return take(() => {
        if (!table) return;
        // Right widens, and Left narrows, from left to right; the other way round from right to left
        if (e.key === 'ArrowLeft') resizeColumn(table, i, { by: back * COL_STEP_PX });
        else if (e.key === 'ArrowRight') resizeColumn(table, i, { by: -back * COL_STEP_PX });
        else if (tr.closest('tbody')) resizeRow(tr, e.key === 'ArrowDown' ? ROW_STEP_PX : -ROW_STEP_PX);
      });
    }
    if (e.altKey) return;
    if (e.key === 'ArrowDown') return take(() => go(cell, edge ? list.length - 1 : ri + 1, ci));
    if (e.key === 'ArrowUp') return take(() => go(cell, edge ? 0 : ri - 1, ci));
    if (e.key === 'ArrowLeft') return take(() => go(cell, ri, edge ? (back < 0 ? 1 : cells.length - 1) : ci + back));
    if (e.key === 'ArrowRight') return take(() => go(cell, ri, edge ? (back < 0 ? cells.length - 1 : 1) : ci - back));
    if (e.key === 'Home') return take(() => go(cell, edge ? 1 : ri, 1));
    if (e.key === 'End') return take(() => go(cell, edge ? list.length - 1 : ri, edge ? Infinity : cells.length - 1));
    if (e.key === 'PageDown') return take(() => go(cell, ri + page(tr), ci));
    if (e.key === 'PageUp') return take(() => go(cell, ri - page(tr), ci));
    // Enter or Space on a head sorts by its column; on a row the card opens it, as a tap does
    if ((e.key === 'Enter' || e.key === ' ') && cell.hasAttribute('data-col') && cell.closest('thead'))
      return take(() => sortBy(cell));
    if (edge && !e.shiftKey && (e.key === 'c' || e.key === 'C') && !hasChosenText())
      return take(() => void navigator.clipboard?.writeText(cell.textContent ?? '').catch(() => {}));
  });
  // a click on a head, not on its grip, sorts by its column
  scroll.addEventListener('click', (e: MouseEvent) => {
    const th = (e.target as Element | null)?.closest?.<HTMLElement>('thead th[data-col]');
    if (!th || (e.target as Element).closest('.thoughtknot-col-grip')) return;
    sortBy(th);
  });
  for (const t of tables) {
    const kept = SORTS.get(sortKey(t));
    if (kept) sortTable(t, kept.col, kept.way);
  }
}

/** Whether the page has words chosen, which Control and C copies as it always does. */
function hasChosenText(): boolean {
  return !!activeWindow.getSelection?.()?.toString();
}

type Way = 'ascending' | 'descending';
/** How each table was sorted, by its heads, while the app is open: drawn again, it is sorted the same. */
const SORTS = new Map<string, { col: number; way: Way }>();
const sortKey = (t: Element): string =>
  all(t, 'thead th[data-col]')
    .map((th) => th.textContent ?? '')
    .join('\u0001');
const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

/** Sorts by the column of head `th`: first one way, then the other, then back to the order written. */
function sortBy(th: HTMLElement): void {
  const table = th.closest<HTMLElement>('table');
  if (!table) return;
  const col = Number(th.getAttribute('data-col')),
    now = th.getAttribute('aria-sort');
  const way: Way | null = now === 'ascending' ? 'descending' : now === 'descending' ? null : 'ascending';
  if (way) SORTS.set(sortKey(table), { col, way });
  else SORTS.delete(sortKey(table));
  sortTable(table, col, way);
}

/** Puts the rows of `table` in order by column `col`, `way`, or as written when `way` is null. Empty cells go last. */
function sortTable(table: HTMLElement, col: number, way: Way | null): void {
  const body = table.querySelector('tbody');
  if (!body) return;
  const rows = all(body, 'tr');
  rows.forEach((r, i) => r.getAttribute('data-written') ?? r.setAttribute('data-written', String(i)));
  const text = (r: HTMLElement) => all(r, 'td')[col]?.textContent ?? '';
  const sorted = [...rows].sort((a, b) => {
    if (!way) return Number(a.getAttribute('data-written')) - Number(b.getAttribute('data-written'));
    const [x, y] = [text(a), text(b)];
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return way === 'ascending' ? compare(x, y) : compare(y, x);
  });
  const focused = activeDocument.activeElement as HTMLElement | null;
  for (const r of sorted) body.appendChild(r);
  // each row numbered by where it now is; the focus stays on its cell, kept in sight (never disorient the user)
  sorted.forEach((r, i) => {
    const num = r.querySelector('.thoughtknot-row-num');
    if (num) num.textContent = String(i + 1);
  });
  for (const th of all(table, 'thead th[data-col]'))
    th.setAttribute('aria-sort', way && Number(th.getAttribute('data-col')) === col ? way : 'none');
  if (focused && table.contains(focused)) {
    focused.focus({ preventScroll: true });
    focused.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
}
