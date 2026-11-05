// What moves the boxes of a card (spec §6, §68): the drag and the keys, each move written offering its undo
// (move_undo). On a grid, a card is dragged to another column instead.
// A box let go in the middle of another box links the two, and goes back where it was (§72, edit_gestures). Let go beside
// one, it moves there as before. Where no box moves, a drag only links.
import { BoxDrag, nudgeDrops, type BoxMoving, type DragHost } from './box-drag-view';
import { BoxMoveKeys } from './box-move-keys';
import { gridDrops } from './grid-drag';
import { MoveUndo } from './move-undo';
import type { ViewOptions } from './view-options';
import { word, type Zoom } from '@thoughtknot/core';
import { moveHint } from './box-move-keys';
import { linkDrops, type Linker } from './box-links.ts';
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
  host: Pick<DragHost, 'viewport' | 'taps'> & { zoom: Zoom; card: Lifecycle; links?: Linker },
): { drag: BoxDrag; keys: BoxMoveKeys | null; undo: MoveUndo | null } | null {
  const links = host.links;
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
  const boxes = o.reading.graphs.get(o.graph)?.boxes ?? [];
  const textOf = (key: string) => boxes.find((b) => b.key === key)?.text ?? key;
  // where no box moves, a drag still links one thing to another
  if (!given && svg && links) {
    const drops = linkDrops(links, textOf, say(host.viewport), {
      nowhere: (key) => word('edit.drop-nowhere', { thing: textOf(key) }),
      drop: () => null,
    });
    const readOnly = () => !links.canWrite();
    return { drag: new BoxDrag({ ...shared, readOnly, textOf, ...drops }), keys: null, undo };
  }
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
  const rankdir = () => (o.drawn.mirrored ? 'RL' : o.drawn.rankdir);
  return {
    drag: new BoxDrag({
      ...shared,
      textOf,
      ...(links
        ? linkDrops(links, textOf, say(host.viewport), nudgeDrops(moving, textOf, rankdir))
        : nudgeDrops(moving, textOf, rankdir)),
    }),
    keys: new BoxMoveKeys({ ...shared, moving, textOf }),
    undo,
  };
}

/** Says `why` in the line under the drawing in `viewport`. */
const say = (viewport: HTMLElement) => (why: string) => {
  const line = moveHint(viewport);
  line.hidden = false;
  line.textContent = why;
};
