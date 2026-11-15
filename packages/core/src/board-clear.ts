// Arranged cards kept clear of every other card (editor spec ES§45, board_arranged_by_graph; Roger, 15 Nov 2026).
// - The arranged cards are spaced by their real sizes, so none lies over another.
// - A card that would land on one that stays is moved the least way to free ground, in steps, not thrown elsewhere.
// Host-free and pure.
import type { Box } from './board-svg.ts';

/** The room left between two cards, in board units. */
const MARGIN = 24;
/** How far a card is moved at a time to find free ground. */
const STEP = 40;
/** How many steps out to look before it is left where it fell. */
const REACH = 40;

/** Whether two boxes lie over each other, or nearer than the margin. */
const near = (a: Box, b: Box) =>
  a.x < b.x + b.w + MARGIN && b.x < a.x + a.w + MARGIN && a.y < b.y + b.h + MARGIN && b.y < a.y + a.h + MARGIN;

/**
 * The scale, no smaller than `from`, at which cards of `sizes` at `spots` (in the layout's own units) lie clear of each
 * other. The spots keep their shape; only the room between them grows.
 */
export function roomy(spots: readonly (readonly [number, number])[], sizes: readonly Box[], from: number): number {
  let scale = from;
  for (let tries = 0; tries < 24; tries++) {
    const boxes = spots.map(([x, y], i) => ({ x: x * scale, y: y * scale, w: sizes[i]?.w ?? 0, h: sizes[i]?.h ?? 0 }));
    const clash = boxes.some((a, i) => boxes.some((b, j) => j > i && near(a, b)));
    if (!clash) return scale;
    scale *= 1.15;
  }
  return scale;
}

/**
 * Each card of `wants` is given a place clear of `fixed` (the cards that stay) and of the cards given theirs already.
 * A card whose place is free keeps it. Else it moves the least way, in steps.
 */
export function cleared(
  wants: readonly { w: number; h: number; to: [number, number] }[],
  fixed: readonly Box[],
): [number, number][] {
  const taken: Box[] = [...fixed];
  return wants.map(({ w, h, to }) => {
    const free = (x: number, y: number) => !taken.some((t) => near({ x, y, w, h }, t));
    let best: [number, number] = to;
    search: if (!free(to[0], to[1])) {
      for (let r = 1; r <= REACH; r++) {
        const ring: [number, number][] = [];
        for (let i = -r; i <= r; i++)
          for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i, j]);
        // nearest first within a ring, so the least way wins; a tie goes to the same side every time
        ring.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || a[1] - b[1] || a[0] - b[0]);
        for (const [i, j] of ring) {
          const at: [number, number] = [to[0] + i * STEP, to[1] + j * STEP];
          if (free(at[0], at[1])) {
            best = at;
            break search;
          }
        }
      }
    }
    taken.push({ x: best[0], y: best[1], w, h });
    return best;
  });
}
