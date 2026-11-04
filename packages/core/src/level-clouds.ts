// Each group of a level of detail drawn as a soft cloud round its things (editor spec §68, level_clouds). Roger, 3 Nov
// 2026: far out, show the subjects as clouds with their names; zoom in for areas, then topics, then every item. A cloud
// fits its things: it is the smooth outline round them, with room to spare. It moves nothing: things stay put, and the
// clouds are drawn under them. Host-free and pure.
import type { DetailLevel } from './detail-levels.ts';

/** A box in the drawing's units. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A cloud to draw: its group, how many things it holds, its outline as an SVG path, and where its name goes. */
export interface Cloud {
  key: string;
  name: string;
  count: number;
  path: string;
  x: number;
  y: number;
  /** Its place among the clouds of its level, so each can take its own colour. */
  index: number;
  /** The box round its things with their room: where roads leave it, and what other roads go round. */
  box: Rect;
}

type Point = [number, number];

const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** The convex hull of `points`, going round one way, by the monotone chain. */
function hull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2) as Point, lower.at(-1) as Point, q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2) as Point, upper.at(-1) as Point, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const round = (n: number): number => Math.round(n * 100) / 100;
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * The outline of a cloud round `rects`, each grown by `pad`. It is the hull of their corners. Its own corners are
 * rounded by curves through the middles of its sides, so it reads as one soft shape. Empty for no rects.
 */
export function cloudPath(rects: readonly Rect[], pad: number): string {
  const corners: Point[] = rects.flatMap((r) => [
    [r.left - pad, r.top - pad],
    [r.right + pad, r.top - pad],
    [r.right + pad, r.bottom + pad],
    [r.left - pad, r.bottom + pad],
  ]);
  const h = hull(corners);
  if (!h.length) return '';
  const start = mid(h.at(-1) as Point, h[0] as Point);
  let d = `M${round(start[0])},${round(start[1])}`;
  h.forEach((p, i) => {
    const m = mid(p, h[(i + 1) % h.length] as Point);
    d += ` Q${round(p[0])},${round(p[1])} ${round(m[0])},${round(m[1])}`;
  });
  return `${d} Z`;
}

/**
 * The clouds of level `at` of `levels`, round the things whose boxes `rectOf` gives, each grown by `pad`. A group none of
 * whose things is drawn has no cloud. The last level, where every item shows, has none.
 */
export function cloudsAt(
  levels: readonly DetailLevel[],
  at: number,
  rectOf: ReadonlyMap<string, Rect>,
  pad: number,
): Cloud[] {
  const clouds: Cloud[] = [];
  (levels[at]?.groups ?? []).forEach((g, index) => {
    const rects = g.things.flatMap((k) => rectOf.get(k) ?? []);
    if (!rects.length) return;
    const top = Math.min(...rects.map((r) => r.top)) - pad,
      left = Math.min(...rects.map((r) => r.left)),
      right = Math.max(...rects.map((r) => r.right)),
      bottom = Math.max(...rects.map((r) => r.bottom)) + pad;
    clouds.push({
      key: g.key,
      name: g.name,
      count: g.things.length,
      path: cloudPath(rects, pad),
      x: (left + right) / 2,
      y: top,
      index,
      box: { left: left - pad, top, right: right + pad, bottom },
    });
  });
  return clouds;
}
