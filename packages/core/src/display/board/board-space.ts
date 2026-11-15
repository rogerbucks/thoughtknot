// Where things are on a board's screen (editor spec §45, board_view). It gives the viewport's size and a spot of the
// view in board units, and back. It also gives a box of the board as a part of the whole. And it opens a board at
// a size its text can be read. Kept apart so board-view.ts stays small.

import { STYLE, type Zoom } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { READABLE_PX } from '../../details-nav.ts';
import { aimAt, type Place } from './board-aim.ts';
import { boardOutline, itemBox, type Box } from '../../board-svg.ts';

/** How tall a board's viewport is in a note, in pixels. */
export const HEIGHT = 420;

/** A spot in the viewport, in pixels. */
export type Point = { x: number; y: number };

/** The geometry of one board's view, read from its viewport, its zoom and its frame as they are now. */
export class BoardSpace {
  constructor(
    private readonly vp: HTMLElement,
    private readonly zoom: () => Zoom,
    private readonly frame: () => Box,
  ) {}

  size() {
    return { width: this.vp.getBoundingClientRect().width || 600, height: HEIGHT };
  }

  /** A box of the board as a part of the whole board, as the zoom wants it. */
  unit(b: Box) {
    const f = this.frame();
    return { x: (b.x - f.x) / f.w, y: (b.y - f.y) / f.h, width: b.w / f.w, height: b.h / f.h };
  }

  /**
   * Opens a board at a size its text can be read (never disorient: a board opened too small to read says nothing).
   * A board whose text can be read when the whole of it fits stays fitted. A bigger one opens on its first frame, or
   * on its first item when it has no frame. The rest is a pan away, and Fit still shows the whole.
   */
  open(board: Board): void {
    const lines = boardOutline(board).map((l) => board.items.find((i) => i.id === l.id));
    const first = lines.find((i) => i?.kind === 'Frame') ?? lines[0];
    const scale = READABLE_PX / STYLE.font_size;
    if (!first || this.zoom().view().scale >= scale) return;
    const s = this.size(),
      b = itemBox(first);
    // a frame bigger than the view opens on its top left corner, where reading starts
    const part = { x: b.x, y: b.y, w: Math.min(b.w, s.width / scale), h: Math.min(b.h, s.height / scale) };
    const to = this.zoom().aim(this.unit(part), scale, true);
    if (to) this.zoom().restore(to.scale, to.x, to.y);
  }

  /**
   * Where the view goes so the items `ids` are all in sight, and where it is now. Null when they are in sight already
   * (board-aim.ts).
   */
  aimAt(board: Board, ids: string[]): { from: Place; to: Place } | null {
    const { scale, x, y } = this.zoom().view();
    const boxes = board.items.filter((i) => ids.includes(i.id)).map(itemBox);
    const to = aimAt({ scale, x, y }, this.size(), this.frame(), boxes);
    return to && { from: { scale, x, y }, to };
  }

  /** Puts the view at a place, within the zoom's limits. */
  go(to: Place): void {
    this.zoom().restore(to.scale, to.x, to.y);
  }

  /** The middle of the view, in board units. */
  centre(): [number, number] {
    const v = this.zoom().view(),
      s = this.size(),
      f = this.frame();
    return [f.x + (s.width / 2 - v.x) / v.scale, f.y + (s.height / 2 - v.y) / v.scale];
  }

  /** Where an event is in the viewport, in pixels. */
  point(e: { clientX: number; clientY: number }): Point {
    const r = this.vp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** A spot of the view in board units. */
  onBoard(p: Point): [number, number] {
    const v = this.zoom().view(),
      f = this.frame();
    return [Math.round(f.x + (p.x - v.x) / v.scale), Math.round(f.y + (p.y - v.y) / v.scale)];
  }
}
