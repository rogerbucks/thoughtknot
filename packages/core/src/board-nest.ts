// Boards inside boards (editor spec §45, board_nested). A View item that names a board, `(v:View {board: 'plan'})`,
// shows that board on this one. Zooming in on it, once it fills most of the view, goes on into that board. Zooming out
// of a board entered this way, once all of it is in view, comes back to the board it sits on. The inner board opens
// just where its picture was, so nothing jumps. Host-free and pure.
import type { Board, BoardItem } from './board.ts';
import { itemBox, type Box } from './board-svg.ts';

/** How much of the view's width or height a board's picture fills before a zoom in goes on into it. */
export const ENTER_FILL = 0.8;

/** A view of a board: its scale and the top-left corner of the whole board in the viewport, in pixels. */
export interface Place {
  scale: number;
  x: number;
  y: number;
}

/** The board an item shows, when it is a view of a board: the name its `board` gives. */
export function nestedBoardOf(item: BoardItem): string | null {
  const name = item.more.board;
  return item.kind === 'View' && typeof name === 'string' && name ? name : null;
}

/** Where a box of the board is in the viewport, in pixels. */
function onScreen(box: Box, frame: Box, view: Place): Box {
  return {
    x: view.x + (box.x - frame.x) * view.scale,
    y: view.y + (box.y - frame.y) * view.scale,
    w: box.w * view.scale,
    h: box.h * view.scale,
  };
}

/**
 * The board a zoom in at `at` goes on into, with the item that shows it, or null. It is the topmost view of a board
 * under that spot of the viewport, once it fills enough of the view's width or height.
 */
export function entering(
  board: Board,
  frame: Box,
  view: Place,
  size: { width: number; height: number },
  at: { x: number; y: number },
): { id: string; name: string } | null {
  const under = board.items
    .map((item, n) => ({ item, n, box: onScreen(itemBox(item), frame, view) }))
    .filter(({ box }) => at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h)
    .sort((a, b) => (b.item.layer ?? 0) - (a.item.layer ?? 0) || b.n - a.n)[0];
  const name = under && nestedBoardOf(under.item);
  if (!under || !name) return null;
  const fills = under.box.w >= size.width * ENTER_FILL || under.box.h >= size.height * ENTER_FILL;
  return fills ? { id: under.item.id, name } : null;
}

/**
 * Where the inner board goes so it is drawn just where its picture was. `box` is the picture's room on the outer
 * board, whose frame and view are given; `inner` is the inner board's frame. The picture sat whole in the middle of
 * its room, and so does the board.
 */
export function placeInside(box: Box, frame: Box, view: Place, inner: Box): Place {
  const room = onScreen(box, frame, view);
  const scale = Math.min(room.w / inner.w, room.h / inner.h);
  return { scale, x: room.x + (room.w - inner.w * scale) / 2, y: room.y + (room.h - inner.h * scale) / 2 };
}
