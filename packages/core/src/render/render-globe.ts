// The globe: phase P3 of the rendering spec (wiki/Rendering-spec.md; editor spec §71, globe_view). The globe shows the
// same marks as 2D, wrapped round a ball you look at from outside (Roger, 7 Nov 2026: one look, never two). The flat
// drawing lies on the ball's skin. The middle of the screen faces you. A thing further out lies further round, and
// past the edge it is on the far side, out of sight. Nothing moves in the drawing: a pan turns the ball, and a zoom
// brings it near, where its skin is all but flat. With no bend the picture is the flat one, pixel for pixel.
// Host-free and pure.
import type { Spot } from './render-rooms.ts';
import type { View } from './render-marks.ts';

/** How far round the ball the drawing's edge lies at the fitted zoom, in radians: most of the near side, not all. */
const REACH = 1.2;

/** How far a road's arch stands off the ball, as a share of its length on the screen. */
const ARCH = 0.1;
/** The highest a road's arch stands off the ball, in pixels, however long the road. */
const ARCH_PX = 36;

/** A point on the screen as the globe shows it. It says how much it shrinks (1 in the middle), and if it is hidden. */
export interface OnGlobe {
  x: number;
  y: number;
  k: number;
  behind: boolean;
}

/** Whether `view` shows the drawing on a globe. */
export const isGlobe = (view: View): boolean => !!view.globe;

/** The bend that puts the drawing of `spots` round the near side of a ball: one over its radius, in drawing units. */
export function bendOf(spots: Iterable<Spot>): number {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of spots) {
    left = Math.min(left, s.x - s.r);
    top = Math.min(top, s.y - s.r);
    right = Math.max(right, s.x + s.r);
    bottom = Math.max(bottom, s.y + s.r);
  }
  const half = Math.max(right - left, bottom - top) / 2;
  return Number.isFinite(half) && half > 0 ? REACH / half : 0;
}

/**
 * `view` turned back by whole turns of the ball, so it faces the drawing again from the other side. The drawing lies
 * once round the ball. A pan that goes on past its edge comes round to it again, as a world does (Roger, 13 Nov
 * 2026). The jump is made only half a turn away, where the whole drawing is round the back, so it never shows.
 */
export function aroundAgain(view: View, spots: Iterable<Spot>): View {
  if (!view.globe) return view;
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of spots)
    [left, top, right, bottom] = [Math.min(left, s.x), Math.min(top, s.y), Math.max(right, s.x), Math.max(bottom, s.y)];
  if (!Number.isFinite(left)) return view;
  const turn = (2 * Math.PI) / view.globe,
    [cx, cy] = middleOf(view);
  const [nx, ny] = [
    Math.round((view.x + cx / view.scale - (left + right) / 2) / turn),
    Math.round((view.y + cy / view.scale - (top + bottom) / 2) / turn),
  ];
  return nx || ny ? { ...view, x: view.x - nx * turn, y: view.y - ny * turn } : view;
}

/** The middle of the part of the screen the controls leave clear: the point of the ball that faces you. */
export function middleOf(view: View): [number, number] {
  const c = view.clear ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return [c.left + (view.w - c.left - c.right) / 2, c.top + (view.h - c.top - c.bottom) / 2];
}

/** How much the ball bends per screen pixel: its bend over the zoom. Near in, the ball is big and nearly flat. */
const perPixel = (view: View): number => (view.globe ?? 0) / view.scale;

/** The ball's radius on the screen, in pixels; none while flat. */
export const ballRadius = (view: View): number => {
  const k = perPixel(view);
  return k ? 1 / k : Infinity;
};

/**
 * The flat screen's point `x`, `y` as the globe shows it. It keeps its way from the middle; its distance becomes an
 * angle round the ball. Past a quarter turn it is on the far side: behind, at the ball's edge.
 */
export function wrapped(x: number, y: number, view: View): OnGlobe {
  const k = perPixel(view);
  if (!k) return { x, y, k: 1, behind: false };
  const [cx, cy] = middleOf(view);
  const [dx, dy] = [x - cx, y - cy];
  const d = Math.hypot(dx, dy);
  if (!d) return { x, y, k: 1, behind: false };
  const angle = d * k,
    behind = angle > Math.PI / 2;
  const out = Math.sin(Math.min(angle, Math.PI / 2)) / k;
  return { x: cx + (dx / d) * out, y: cy + (dy / d) * out, k: Math.max(0, Math.cos(angle)), behind };
}

/** The flat screen's point that the globe shows at `x`, `y`: `wrapped` undone. A point off the ball maps to its edge. */
export function unwrapped(x: number, y: number, view: View): [number, number] {
  const k = perPixel(view);
  if (!k) return [x, y];
  const [cx, cy] = middleOf(view);
  const [dx, dy] = [x - cx, y - cy];
  const d = Math.hypot(dx, dy);
  if (!d) return [x, y];
  const out = Math.asin(Math.min(1, d * k)) / k;
  return [cx + (dx / d) * out, cy + (dy / d) * out];
}

/** Where a spot of the drawing is on the globe, how big, how near, and whether it is out of sight. */
export function onGlobe(spot: Spot, view: View): Spot & { k: number; behind: boolean } {
  const [x, y] = [(spot.x - view.x) * view.scale, (spot.y - view.y) * view.scale];
  const w = wrapped(x, y, view);
  // a thing shrinks toward the edge, never to nothing, so it stays easy to see until it turns away
  const r = spot.r * view.scale * (0.35 + 0.65 * w.k);
  // a thing may have its middle round the back and its body over the edge (Roger, 8 Nov 2026). It is part in sight:
  // it sits at the ball's edge, and the painter cuts it there.
  const [cx, cy] = middleOf(view);
  const past = Math.hypot(x - cx, y - cy) * perPixel(view) - Math.PI / 2;
  return { x: w.x, y: w.y, r, k: w.k, behind: w.behind && past > spot.r * view.scale * perPixel(view) };
}

/** The control point of a road's arch over the ball, between `p` and `q`: its middle stands off the skin. */
export function archOver(p: Spot, q: Spot, view: View): [number, number] | undefined {
  if (!isGlobe(view)) return undefined;
  const flat = (s: Spot): [number, number] => [(s.x - view.x) * view.scale, (s.y - view.y) * view.scale];
  const [[ax, ay], [bx, by]] = [flat(p), flat(q)];
  const [s, t, m] = [wrapped(ax, ay, view), wrapped(bx, by, view), wrapped((ax + bx) / 2, (ay + by) / 2, view)];
  // the middle lifts away from the ball's middle, as a road over a hill seen from above
  const [cx, cy] = middleOf(view);
  const out = Math.hypot(m.x - cx, m.y - cy) || 1,
    rise = Math.min(ARCH_PX, ARCH * Math.hypot(t.x - s.x, t.y - s.y));
  const top = [m.x + ((m.x - cx) / out) * rise, m.y + ((m.y - cy) / out) * rise];
  return [2 * (top[0] as number) - (s.x + t.x) / 2, 2 * (top[1] as number) - (s.y + t.y) / 2];
}

/** How many pieces each line of the ball's grid is drawn in, so it curves round the ball. */
const PIECES = 24;
/** The spacing of the ball's grid on the screen near its middle, roughly, in pixels. */
const GRID_PX = 90;

/**
 * The ball's own lines: its outline and a faint grid on its skin, the near side only. The grid is fixed to the
 * drawing, so it turns as the ball does, and its spacing halves or doubles as the zoom changes.
 */
export function ballOf(view: View): { disc: [number, number, number]; lines: [number, number, number, number][] } {
  const [cx, cy] = middleOf(view),
    radius = ballRadius(view);
  const step = 2 ** Math.round(Math.log2(GRID_PX / view.scale)); // in the drawing's own units
  // the near side reaches a quarter turn from the middle, as far as the ball's edge goes round. It never reaches far
  // past the screen, however near the zoom brings the ball
  const reach = Math.min((Math.PI / 2) * radius, 3 * Math.max(view.w, view.h)) / view.scale;
  const [mx, my] = [view.x + cx / view.scale, view.y + cy / view.scale];
  const [x0, x1, y0, y1] = [mx - reach, mx + reach, my - reach, my + reach];
  const lines: [number, number, number, number][] = [];
  const at = (x: number, y: number) => wrapped((x - view.x) * view.scale, (y - view.y) * view.scale, view);
  const line = (from: [number, number], to: [number, number]) => {
    for (let i = 0; i < PIECES; i++) {
      const [a, b] = [i / PIECES, (i + 1) / PIECES];
      const p = at(from[0] + (to[0] - from[0]) * a, from[1] + (to[1] - from[1]) * a),
        q = at(from[0] + (to[0] - from[0]) * b, from[1] + (to[1] - from[1]) * b);
      if (!p.behind && !q.behind) lines.push([p.x, p.y, q.x, q.y]);
    }
  };
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) line([x, y0], [x, y1]);
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) line([x0, y], [x1, y]);
  return { disc: [cx, cy, radius], lines };
}
