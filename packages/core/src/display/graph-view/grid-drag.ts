// A card dragged to another column of a grid drawn on the card (editor spec §68, projection_grid). It is picked up and
// moved as any box is (box-drag-view.ts). While it is over another column, a line says the value it would take. Let go,
// that value is written as its property where the thing is written: into the text being edited, or else into the
// note. The line then says it was moved, or why not. Nothing is written while the card is only read.
// - Each column has a button that adds a card to it, ready to name (edit_cells). They sit in a row at the top of the
//   drawing, over it, in the columns' order.
import { CORE_DIAGRAMS_ID, gridDrop, gridMoved, word } from '@thoughtknot/core';
import { GRID_NONE, gridSplit } from '../../view-types/grid-view.ts';
import { button } from '../button';
import type { DragHost } from './box-drag-view';
import { moveHint } from './box-move-keys';
import { accept } from './estimate-actions';
import type { MoveUndo } from './move-undo';
import type { ViewOptions } from './view-options';

/** The type a grid is chosen by in the style graph. */
const GRID_TYPE = `${CORE_DIAGRAMS_ID}.grid`;

/** How a box let go moves a card on the grid `o` draws live, with the line in `viewport`; none for any other card. */
export function gridDrops(
  o: ViewOptions,
  viewport: HTMLElement,
  undo?: MoveUndo,
): Pick<DragHost, 'drop' | 'nowhere' | 'textOf'> | null {
  const p = o.diagram?.picture;
  if (!p?.live || p.type !== GRID_TYPE || !p.shape) return null;
  const shape = p.shape;
  const textOf = (key: string) => shape.things.find((t) => t.key === key)?.text ?? key;
  return {
    textOf,
    nowhere: (key) => word('view.grid.nowhere', { thing: textOf(key) }),
    drop: (key, at, boxes) => {
      const d = gridDrop(shape, key, at, boxes);
      if (!d) return null;
      const said = { thing: textOf(key), column: d.column };
      return {
        other: null,
        said: word('view.grid.move', said),
        write: () => {
          const line = moveHint(viewport);
          const say = (why: string | null) => {
            line.hidden = false;
            line.textContent = why ?? word('view.grid.moved', said);
          };
          const m = gridMoved(o.reading.texts, o.graph, key, d);
          if ('reason' in m) say(m.reason);
          else
            void accept(o, m.block, m.was, m.now).then((why) => {
              say(why);
              // written: the move can be taken back, by writing the block as it was (move_undo)
              if (!why)
                undo?.offer(word('view.grid.moved', said), () =>
                  accept(o, m.block, m.now, m.was).then((back) => say(back ?? word('move.undone'))),
                );
            });
        },
      };
    },
  };
}

/** Says `text` in the line of `viewport`, under the drawing. */
function say(viewport: HTMLElement, text: string): void {
  const line = moveHint(viewport);
  line.hidden = false;
  line.textContent = text;
}

/** A column of a grid, to add a card to: the property its columns are by, its value or none, and a card in it. */
export interface GridColumn {
  by: string;
  value: string | null;
  peer?: string;
}

/**
 * Adds a row of buttons to `layer`, one per column of the grid `o` draws live, each adding a card there by `add`. Why
 * one wrote nothing is said in the line of `viewport`. None for any other card, or a grid by kinds, where a column
 * takes no value.
 */
export function gridAdds(
  o: ViewOptions,
  layer: HTMLElement,
  viewport: HTMLElement,
  add: (column: GridColumn) => Promise<string | null>,
): HTMLElement | null {
  const p = o.diagram?.picture;
  if (!p?.live || p.type !== GRID_TYPE || !p.shape) return null;
  const { by, columns, cell } = gridSplit(p.shape);
  if (!by) return null;
  const row = layer.createDiv({
    cls: 'thoughtknot-grid-adds',
    attr: { role: 'group', 'aria-label': word('view.grid.add-cards') },
  });
  columns.forEach((value, c) => {
    const peer = [...cell].find(([, [at]]) => at === c)?.[0];
    const label = word('view.grid.add', { column: value });
    const column = { by, value: value === GRID_NONE ? null : value, ...(peer ? { peer } : {}) };
    button(row, label, 'plus', () => void add(column).then((why) => why && say(viewport, why)), value);
  });
  return row;
}
