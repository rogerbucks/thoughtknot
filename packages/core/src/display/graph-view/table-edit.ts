// Editing a graph drawn as a table, cell by cell (editor spec §72, edit_cells). It works as a spreadsheet does. F2 on
// a cell of a thing opens it for typing, all of it selected. Enter writes it, and so does leaving it. Escape leaves it
// as it was. Delete or Backspace on a property's cell takes the property away.
// - The Thing column is the thing's name, written as the editor beside a thing writes it (thing-edits.ts).
// - The Kind column is not typed in here. A link's row is not either: its properties are in its details.
// - A value its type cannot read is refused, and the cell says why, still open for typing.
import { word } from '@thoughtknot/core';

/** Writes `words` in the cell of thing `key` under column `column`; resolves to why nothing was written, or null. */
export type CellWrite = (key: string, column: number, prop: string, words: string) => Promise<string | null>;

/** The Thing column and the Kind column, before the properties. */
const THING = 0,
  KIND = 1;

/** The cell `el` is, if it is a cell of a thing that can be typed in: its thing, its column and the property's name. */
function cellOf(
  el: EventTarget | null,
  heads: readonly string[],
): { td: HTMLElement; key: string; col: number } | null {
  const td = (el as Element | null)?.closest?.<HTMLElement>('tbody td');
  const key = td?.closest('tr')?.getAttribute('data-key');
  if (!td || !key) return null;
  const col = Array.from(td.parentElement?.querySelectorAll<HTMLElement>('td') ?? []).indexOf(td);
  return col < 0 || col === KIND || col >= heads.length ? null : { td, key, col };
}

/** Lets the cells of the things' table in `scroll` be typed in, each written by `write`. */
export function bindCellEdits(scroll: HTMLElement, heads: readonly string[], write: CellWrite): void {
  const prop = (col: number) => (col === THING ? '' : (heads[col] ?? ''));
  const open = (td: HTMLElement, key: string, col: number) => {
    if (td.querySelector('input')) return;
    const was = td.textContent ?? '';
    td.empty();
    const input = td.createEl('input', {
      cls: 'thoughtknot-cell-input',
      attr: { type: 'text', 'aria-label': word('edit.cell', { column: heads[col] ?? '' }) },
    });
    input.value = was;
    let done = false;
    const close = (text: string) => {
      done = true;
      td.empty();
      td.setText(text);
      td.focus({ preventScroll: true });
    };
    const save = () => {
      if (done) return;
      if (input.value === was) return close(was);
      done = true;
      void write(key, col, prop(col), input.value).then((why) => {
        if (!why) return;
        // refused: the cell stays open, saying why
        done = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('title', why);
        td.querySelector('.thoughtknot-cell-said')?.remove();
        td.createDiv({ cls: 'thoughtknot-cell-said', text: why, attr: { role: 'alert' } });
        input.focus({ preventScroll: true });
      });
    };
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation(); // what is typed is the cell's alone
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(was);
      }
    });
    input.addEventListener('blur', save);
    input.focus({ preventScroll: true });
    input.select();
  };
  scroll.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = cellOf(e.target, heads);
    if (!c || (e.target as Element).closest('input')) return;
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      open(c.td, c.key, c.col);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && c.col !== THING) {
      e.preventDefault();
      e.stopPropagation();
      void write(c.key, c.col, prop(c.col), '');
    }
  });
}
