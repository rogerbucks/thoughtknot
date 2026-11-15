// Snapping a dragged item into line with the others (editor spec §45, board_handles). Host-free. While an item is
// dragged, its left, middle or right lines up with another item's left, middle or right once it comes within `slack`.
// So does its top, middle or bottom. Each line it snapped to is given back as a guide, for the host to draw. Only the item
// dragged moves; the others stay put. Holding Alt lets the host place it freely, with no snap.
import type { Board } from './board.ts';
import { itemBox } from './board-svg.ts';
import type { Box } from './board-svg.ts';

/** A guide line: up and down at `x`, or across at `y`, in board units. */
export type Guide = { x: number } | { y: number };

// the three lines of a box along one axis: its start, middle and end
const lines = (start: number, size: number) => [start, start + size / 2, start + size];

/** The nearest shift within `slack` that lines one of `own` up with one of `others`, or null. */
function nearest(own: number[], others: number[], slack: number): { by: number; at: number } | null {
  let best: { by: number; at: number } | null = null;
  for (const o of others)
    for (const m of own) {
      const by = o - m;
      if (Math.abs(by) <= slack && (!best || Math.abs(by) < Math.abs(best.by))) best = { by, at: o };
    }
  return best;
}

/**
 * Where the item `id` goes when dragged to (`x`, `y`), in whole numbers, and the guides it snapped to. It snaps into
 * line with the other items within `slack` board units. The items in `moving`, such as the rest of its group, are skipped.
 */
export function snapPlace(
  board: Board,
  id: string,
  x: number,
  y: number,
  slack: number,
  moving: readonly string[] = [],
): { x: number; y: number; guides: Guide[] } {
  const item = board.items.find((i) => i.id === id);
  if (!item) return { x: Math.round(x), y: Math.round(y), guides: [] };
  const box: Box = itemBox({ ...item, x, y });
  const skip = new Set([id, ...moving]);
  const others = board.items.filter((i) => !skip.has(i.id)).map(itemBox);
  const across = nearest(
    lines(box.x, box.w),
    others.flatMap((o) => lines(o.x, o.w)),
    slack,
  );
  const down = nearest(
    lines(box.y, box.h),
    others.flatMap((o) => lines(o.y, o.h)),
    slack,
  );
  const guides: Guide[] = [];
  if (across) guides.push({ x: across.at });
  if (down) guides.push({ y: down.at });
  return { x: Math.round(x + (across?.by ?? 0)), y: Math.round(y + (down?.by ?? 0)), guides };
}
