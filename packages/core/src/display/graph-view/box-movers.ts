// What moves the boxes of a card (spec §6, §68): the drag and the keys, each move written offering its undo
// (move_undo). On a grid, a card is dragged to another column instead.
// A box let go in the middle of another box links the two, and goes back where it was (§72, edit_gestures). Let go beside
// one, it moves there as before. Where no box moves, a drag only links.
import { BoxDrag, nudgeDrops, type BoxMoving, type DragHost } from './box-drag-view';
import { BoxMoveKeys } from './box-move-keys';
import { gridDrops } from './grid-drag';
import { MoveUndo } from './move-undo';
import type { ViewOptions } from './view-options';
import { word, type PlacedBox, type Zoom } from '@thoughtknot/core';
import { moveHint } from './box-move-keys';
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
    const drops = linkDrops(links, textOf, host.viewport, {
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
        ? linkDrops(links, textOf, host.viewport, nudgeDrops(moving, textOf, rankdir))
        : nudgeDrops(moving, textOf, rankdir)),
    }),
    keys: new BoxMoveKeys({ ...shared, moving, textOf }),
    undo,
  };
}

/** What linking by a drop needs of the card's editor: whether it can write now, and how to write the link. */
export interface Linker {
  canWrite: () => boolean;
  linkDrop: (from: string, to: string, say: (why: string) => void) => void;
}

/** How much of a box's width and height, at each side, is its edge: let go there, a box moves by it, not links. */
const EDGE = 0.25;

/** Whether `at` is in the middle of box `b`, inside its edges. */
const inMiddle = (b: PlacedBox, at: { x: number; y: number }): boolean => {
  const w = (b.right - b.left) * EDGE,
    h = (b.bottom - b.top) * EDGE;
  return at.x >= b.left + w && at.x <= b.right - w && at.y >= b.top + h && at.y <= b.bottom - h;
};

/** The drops of `inner`, but a box let go in the middle of another links the two instead, where the card can write. */
function linkDrops(
  links: Linker,
  textOf: (key: string) => string,
  viewport: HTMLElement,
  inner: Pick<DragHost, 'drop' | 'nowhere'>,
): Pick<DragHost, 'drop' | 'nowhere'> {
  const say = (why: string) => {
    const line = moveHint(viewport);
    line.hidden = false;
    line.textContent = why;
  };
  return {
    nowhere: inner.nowhere,
    drop: (key, at, boxes: PlacedBox[]) => {
      const on = links.canWrite() ? boxes.find((b) => b.key !== key && inMiddle(b, at)) : undefined;
      if (!on) return inner.drop(key, at, boxes);
      const said = word('edit.drop-link', { thing: textOf(key), other: textOf(on.key) });
      return { other: on.key, said, write: () => links.linkDrop(key, on.key, say) };
    },
  };
}
