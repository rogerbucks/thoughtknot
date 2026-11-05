// Linking by a drop (editor spec §72, edit_gestures). Roger, 5 Nov 2026 (Q-19): drag from one thing to another to link
// them. A box let go in the middle of another box links the two, and goes back where it was. Let go by its edge, or
// beside it, it moves as before (box-movers.ts). Where the card cannot write, it only moves.
import { word } from '../../words.ts';
import type { PlacedBox } from '../../box-drag.ts';
import type { DragHost } from './box-drag-view';

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
export function linkDrops(
  links: Linker,
  textOf: (key: string) => string,
  say: (why: string) => void,
  inner: Pick<DragHost, 'drop' | 'nowhere'>,
): Pick<DragHost, 'drop' | 'nowhere'> {
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
