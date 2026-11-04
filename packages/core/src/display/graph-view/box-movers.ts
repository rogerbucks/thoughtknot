// What moves the boxes of a card (spec §6, §68): the drag and the keys, each move written offering its undo
// (move_undo). On a grid, a card is dragged to another column instead.
import { BoxDrag, nudgeDrops, type BoxMoving, type DragHost } from './box-drag-view';
import { BoxMoveKeys } from './box-move-keys';
import { gridDrops } from './grid-drag';
import { MoveUndo } from './move-undo';
import type { ViewOptions } from './view-options';
import type { Zoom } from '@thoughtknot/core';
import type { Lifecycle } from '../lifecycle';

/**
 * What moves the boxes of a card given `o` and drawing `svg` (§6): the drag (drag_moves_box) and the keys
 * (move_box_keyboard). They move in the direction the card was laid out in, each box named by the text drawn on it.
 * On a grid, a card is dragged to another column instead, and no keys move it (§68). None when the card was given no
 * way to write a nudge, or draws a table. Nothing moves while the card is only read.
 */
export function boxMoversFor(
  o: ViewOptions,
  svg: SVGSVGElement | null,
  host: Pick<DragHost, 'viewport' | 'taps'> & { zoom: Zoom; card: Lifecycle },
): { drag: BoxDrag; keys: BoxMoveKeys | null; undo: MoveUndo | null } | null {
  const shared = {
    viewport: host.viewport,
    taps: host.taps,
    view: () => host.zoom.view(),
    readOnly: () => !!o.readOnly?.(),
  };
  // each move written offers its undo, where the card can take one back (move_undo)
  const undo = new MoveUndo(host.viewport, o.graph);
  host.card.register(() => undo.onunload());
  const grid = svg ? gridDrops(o, host.viewport, undo) : null;
  if (grid) return { drag: new BoxDrag({ ...shared, ...grid }), keys: null, undo };
  const given = o.moving;
  if (!given || !svg) return null;
  const moving: BoxMoving = given.undo
    ? {
        ...given,
        move: (nudge, done) => {
          given.move(nudge, done);
          undo.offer(done, () => given.undo?.());
        },
      }
    : given;
  const boxes = o.reading.graphs.get(o.graph)?.boxes ?? [];
  const textOf = (key: string) => boxes.find((b) => b.key === key)?.text ?? key;
  const rankdir = () => (o.drawn.mirrored ? 'RL' : o.drawn.rankdir);
  return {
    drag: new BoxDrag({
      ...shared,
      textOf,
      ...nudgeDrops(moving, textOf, rankdir),
    }),
    keys: new BoxMoveKeys({ ...shared, moving, textOf }),
    undo,
  };
}
