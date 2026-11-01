// A card dragged to another column of a grid drawn on the card (editor spec §68, projection_grid). It is picked up and
// moved as any box is (box-drag-view.ts). While it is over another column, a line says the value it would take. Let go,
// that value is written as its property where the thing is written: into the text being edited, or else into the
// note. The line then says it was moved, or why not. Nothing is written while the card is only read.
import { CORE_DIAGRAMS_ID, gridDrop, gridMoved, word } from '@thoughtknot/core';
import type { DragHost } from './box-drag-view';
import { moveHint } from './box-move-keys';
import { accept } from './estimate-actions';
import type { ViewOptions } from './view-options';

/** The type a grid is chosen by in the style graph. */
const GRID_TYPE = `${CORE_DIAGRAMS_ID}.grid`;

/** How a box let go moves a card on the grid `o` draws live, with the line in `viewport`; none for any other card. */
export function gridDrops(o: ViewOptions, viewport: HTMLElement): Pick<DragHost, 'drop' | 'nowhere' | 'textOf'> | null {
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
          else void accept(o, m.block, m.was, m.now).then(say);
        },
      };
    },
  };
}
