// Zooming through boards (editor spec §45, board_nested). A view of a board sits on a board as an item. A zoom in on
// it, once it fills most of the view, goes on into that board, which opens just where its picture was. A zoom out of a
// board entered this way, once all of it is in view, comes back out. Enter on such an item goes in too, and the trail
// above the board is the way back by a press. Kept apart so board-view.ts stays small.
import type { View, Zoom } from '@thoughtknot/core';

import { readBoard, type Board } from '../../board.ts';
import type { BoardCursor } from '../../board-keys.ts';
import { NO_CURSOR } from '../../board-keys.ts';
import { entering, nestedBoardOf, placeInside } from '../../board-nest.ts';
import { boardFrame, type Box } from '../../board-svg.ts';
import { viewSpace } from '../../view-types/board-views.ts';
import { fromTrackpad } from '../../render/render-tilt.ts';
import type { BoardSpace, Point } from './board-space.ts';
import { bindWheel } from './board-wheel.ts';

/** The view and keyboard of each board drawn, by its host's key, for when it is drawn again. */
export const kept = new Map<string, { place: View; cursor: BoardCursor; focused: boolean }>();

/** What a board needs of its host to go into the boards on it, and back out. */
export interface NestHost {
  /** How many boards deep this one was entered: 0 for a board opened from the list. */
  depth: number;
  /** The block of another board of the note, or nothing when the note has none of that name. */
  text: (name: string) => string | undefined;
  /** What names another board of the note in the host: the key its view is kept by. */
  keyOf: (name: string) => string;
  /** Puts the board `name` in front, entered from this one. */
  enter: (name: string) => void;
  /** Puts the board this one was entered from back in front. */
  leave: () => void;
}

/** How long after a wheel, key or pinch a change of zoom still counts as the person's own, in milliseconds. */
const OWN_MS = 400;

/**
 * Gives the viewport's wheel, double click and touch to `zoom`, and goes into and out of boards as the person zooms.
 * `now` gives the board as drawn, its frame and the item in focus.
 */
export function bindNest(
  vp: HTMLElement,
  zoom: Zoom,
  space: BoardSpace,
  now: () => { board: Board; frame: Box; focus: string | null },
  host: { nest?: NestHost },
): void {
  const nest = host.nest;
  if (nest) {
    let at: Point | null = null,
      gone = false,
      own = 0,
      scale = zoom.view().scale;
    const middle = (): Point => ({ x: space.size().width / 2, y: space.size().height / 2 });
    // the inner board opens where its picture was, with the keyboard on it
    const goIn = (id: string, name: string): boolean => {
      const text = nest.text(name);
      const item = now().board.items.find((i) => i.id === id);
      if (gone || text === undefined || !item) return false;
      const to = placeInside(viewSpace(item), now().frame, zoom.view(), boardFrame(readBoard(text).board));
      kept.set(nest.keyOf(name), { place: { ...zoom.view(), ...to }, cursor: NO_CURSOR, focused: true });
      gone = true;
      nest.enter(name);
      return true;
    };
    const zoomedInto = (p: Point): boolean => {
      const into = entering(now().board, now().frame, zoom.view(), space.size(), p);
      return !!into && goIn(into.id, into.name);
    };
    const zoomedOut = (): boolean => {
      if (gone || !nest.depth || zoom.zoomedIn()) return false;
      gone = true;
      nest.leave();
      return true;
    };
    const taken = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    vp.addEventListener('pointermove', (e: PointerEvent) => {
      at = space.point(e);
      if (e.pointerType === 'touch') own = Date.now();
    });
    vp.addEventListener('wheel', (e: WheelEvent) => {
      if (e.altKey || (fromTrackpad(e) && !e.ctrlKey && !e.metaKey)) return; // two fingers on a trackpad pan
      at = space.point(e);
      own = Date.now();
      // a zoom the view has no room left for still goes in, or out
      if (e.deltaY < 0 ? zoomedInto(at) : zoomedOut()) taken(e);
    });
    vp.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.target !== vp || e.ctrlKey || e.metaKey || e.altKey) return;
      own = Date.now();
      const item = now().board.items.find((i) => i.id === now().focus);
      const name = e.key === 'Enter' && item ? nestedBoardOf(item) : null;
      if ((name && item && goIn(item.id, name)) || (e.key === '-' && zoomedOut())) taken(e);
    });
    const was = zoom.onChange;
    zoom.onChange = (v) => {
      was?.(v);
      const grew = v.scale > scale;
      scale = v.scale;
      if (grew && Date.now() - own < OWN_MS) zoomedInto(at ?? middle());
    };
  }
  bindWheel(vp, zoom, (e) => space.point(e));
}
