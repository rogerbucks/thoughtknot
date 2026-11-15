// Where things are on a board's screen (editor spec §45, board_view). It gives the viewport's size and a spot of the
// view in board units, and back. It also gives a box of the board as a part of the whole. Kept apart so board-view.ts
// stays small.

import type { Zoom } from '@thoughtknot/core';

import type { Box } from '../../board-svg.ts';

/** How tall a board's viewport is in a note, in pixels. */
export const HEIGHT = 420;

/** A spot in the viewport, in pixels. */
export type Point = { x: number; y: number };

/** The geometry of one board's view, read from its viewport, its zoom and its frame as they are now. */
export class BoardSpace {
  private readonly vp: HTMLElement;
  private readonly zoom: () => Zoom;
  private readonly frame: () => Box;

  constructor(vp: HTMLElement, zoom: () => Zoom, frame: () => Box) {
    this.vp = vp;
    this.zoom = zoom;
    this.frame = frame;
  }

  /** The board itself while it is shown over the whole screen, as a slide show is; then the view is as tall as it. */
  full: HTMLElement | null = null;

  size() {
    const height = this.full?.getBoundingClientRect().height || HEIGHT;
    return { width: this.vp.getBoundingClientRect().width || 600, height };
  }

  /** A box of the board as a part of the whole board, as the zoom wants it. */
  unit(b: Box) {
    const f = this.frame();
    return { x: (b.x - f.x) / f.w, y: (b.y - f.y) / f.h, width: b.w / f.w, height: b.h / f.h };
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
