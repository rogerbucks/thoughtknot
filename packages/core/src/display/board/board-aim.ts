// Where a board's view goes to bring items into sight (editor spec §45, board_arranged_by_graph; ethos: never
// disorient). The view moves only when an item is out of sight, and then the least it can. Pure: the board's view
// hands in what is on screen now (board-space.ts).
import type { Box } from '../../board-svg.ts';

/** The room kept between the items brought into sight and the viewport's edge, in pixels. */
export const EDGE = 16;

/** Where a view is: its scale, and the board's corner in the viewport, in pixels. */
export type Place = { scale: number; x: number; y: number };

/**
 * Where the view goes so `boxes` are all in sight, or null when they are already. `now` is the view, `size` the
 * viewport in pixels and `frame` the board's own box; the boxes are in board units. The view moves the least it can.
 * When the boxes cannot all fit at this zoom, it zooms out just far enough to hold them, with them in the middle.
 */
export function aimAt(now: Place, size: { width: number; height: number }, frame: Box, boxes: Box[]): Place | null {
  if (!boxes.length) return null;
  const { scale, x, y } = now;
  const l = Math.min(...boxes.map((b) => b.x)) - frame.x,
    t = Math.min(...boxes.map((b) => b.y)) - frame.y,
    w = Math.max(...boxes.map((b) => b.x + b.w)) - frame.x - l,
    h = Math.max(...boxes.map((b) => b.y + b.h)) - frame.y - t;
  const [left, top] = [x + l * scale, y + t * scale];
  if (left >= 0 && top >= 0 && left + w * scale <= size.width && top + h * scale <= size.height) return null;
  const [roomW, roomH] = [size.width - 2 * EDGE, size.height - 2 * EDGE];
  if (w * scale > roomW || h * scale > roomH) {
    const out = Math.min(roomW / w, roomH / h);
    return { scale: out, x: size.width / 2 - (l + w / 2) * out, y: size.height / 2 - (t + h / 2) * out };
  }
  // the least move that brings each side in, with a little room at the edge
  const by = (at: number, long: number, room: number) =>
    at < EDGE ? EDGE - at : at + long > room - EDGE ? room - EDGE - at - long : 0;
  return { scale, x: x + by(left, w * scale, size.width), y: y + by(top, h * scale, size.height) };
}
