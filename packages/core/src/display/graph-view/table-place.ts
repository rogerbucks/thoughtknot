// Drawn again, as after an edit, the table keeps the reader's place (spec §15, table_grid_navigation). Ethos principle 8
// says never disorient the user. It is scrolled back to where it was, and the cell that had the focus has it
// again. Each place is kept by the table's heads, while the app is open.
const CELL = 'th[data-col], td, th.thoughtknot-row-head';

/** Where a table was: how far it was scrolled, and the cell with the focus, by its row and column. */
interface Place {
  top: number;
  left: number;
  focus?: { row: string; col: number };
}
const PLACES = new Map<string, Place>();

/** The table's name for its place: the heads of its tables. */
const keyOf = (scroll: HTMLElement): string =>
  Array.from(scroll.querySelectorAll('th[data-col]'))
    .map((th) => th.textContent ?? '')
    .join('\u0001');
/** What a row is known by: its thing's key, its link's number, or a head row. */
const rowOf = (tr: Element): string => tr.getAttribute('data-key') ?? `link:${tr.getAttribute('data-link') ?? 'head'}`;
const cellsOf = (tr: Element): Element[] => Array.from(tr.children).filter((c) => c.matches(CELL));

/** Puts the table in `scroll` back where it was, then keeps where it goes. */
export function keepPlace(scroll: HTMLElement): void {
  const key = keyOf(scroll),
    was = PLACES.get(key);
  if (was) {
    scroll.scrollTop = was.top;
    scroll.scrollLeft = was.left;
    // the focus comes back only when it was lost with the table drawn before, never taken from elsewhere
    const active = activeDocument.activeElement;
    const lost = !active || active === activeDocument.body;
    const tr = was.focus && Array.from(scroll.querySelectorAll('tr')).find((r) => rowOf(r) === was.focus?.row);
    const cell = tr && was.focus ? (cellsOf(tr)[was.focus.col] as HTMLElement | undefined) : undefined;
    if (cell && lost) cell.focus({ preventScroll: true });
  }
  const place: Place = was ?? { top: 0, left: 0 };
  PLACES.set(key, place);
  scroll.addEventListener(
    'scroll',
    () => {
      place.top = scroll.scrollTop;
      place.left = scroll.scrollLeft;
    },
    { passive: true },
  );
  scroll.addEventListener('focusin', (e: FocusEvent) => {
    const cell = (e.target as Element | null)?.closest?.(CELL),
      tr = cell?.parentElement;
    if (cell && tr) place.focus = { row: rowOf(tr), col: cellsOf(tr).indexOf(cell) };
  });
  scroll.addEventListener('focusout', (e: FocusEvent) => {
    // the focus gone elsewhere on the page, or to nothing by a click on its words, is not brought back. A table taken
    // away loses its focus too, while still on the page, as Chromium does: it is told apart by being gone just after
    const to = e.relatedTarget as Node | null;
    if (to && scroll.contains(to)) return;
    queueMicrotask(() => {
      if (scroll.isConnected) delete place.focus;
    });
  });
}
