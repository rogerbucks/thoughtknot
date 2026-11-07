// The camera: layer L6 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_one_camera). One camera
// for the new rendering: it fits the drawing, pans, and zooms. Zoom is smooth: each wheel or trackpad movement zooms
// in proportion to how far it moved, at the pointer, never in steps (Roger, 6 Nov). The detail still changes at each
// level's zoom, so levels fade in as the zoom passes them. It picks the mark under a click from the marks themselves,
// and glides between two views (rule 7, never disorient).
// Host-free and pure.
import { OPEN_FROM, ITEMS_FROM, scaleToOpen } from './render-detail.ts';
import type { Mark, View } from './render-marks.ts';
import type { Clear } from '../zoom-fit.ts';
import type { Spot } from './render-rooms.ts';

/** The space left round the drawing when it is fitted, in pixels. */
const MARGIN = 24;
/** How far past the last level the zoom may go, as a share of the last level's zoom. */
const DEEPEST = 4;
/** How much one pixel of wheel movement zooms, as a power of e: a trackpad's small movements zoom a little each. */
const PER_PIXEL = 0.006;
/** The most one wheel event counts for, in pixels, so a mouse's big notch zooms by about half, never a leap. */
const MOST_PIXELS = 60;

/** No edge covered. */
const OPEN: Clear = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The view that fits every spot in a screen `w` by `h`, in the middle of the part the controls leave `clear`. The
 * chrome never covers the drawing at fit (layer L7).
 */
export function fitView(spots: Iterable<Spot>, w: number, h: number, clear: Clear = OPEN): View {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of spots) {
    left = Math.min(left, s.x - s.r);
    top = Math.min(top, s.y - s.r);
    right = Math.max(right, s.x + s.r);
    bottom = Math.max(bottom, s.y + s.r);
  }
  // too little left clear, as on a narrow card: the controls are ignored rather than the drawing squeezed to nothing
  const roomy = w - clear.left - clear.right > w / 3 && h - clear.top - clear.bottom > h / 3;
  const c = roomy ? clear : OPEN;
  const [iw, ih] = [w - c.left - c.right, h - c.top - c.bottom];
  if (!Number.isFinite(left)) return { x: 0, y: 0, scale: 1, w, h, clear: c };
  const scale = Math.min((iw - 2 * MARGIN) / (right - left || 1), (ih - 2 * MARGIN) / (bottom - top || 1));
  const [cx, cy] = [c.left + iw / 2, c.top + ih / 2];
  return { x: (left + right) / 2 - cx / scale, y: (top + bottom) / 2 - cy / scale, scale, w, h, clear: c };
}

/** How far past the zoom where only the first level shows the reader may still zoom out, as a share of it. */
const PAST_FIRST = 0.9;
/** How far past the fit the reader may zoom out, as a share of it: room round the drawing for its names. */
const PAST_FIT = 0.5;

/**
 * The zoom stops, smallest first: the farthest out the reader may go, then the zoom that opens each level. The
 * farthest out is half the fitted zoom, so the top level's names have room round the drawing. It is further still
 * where that would open the second level. So zoomed right out, the reader always reaches the first level (Roger).
 */
export function stopsOf(sizes: readonly number[], fitted: number): number[] {
  const second = sizes[1] ? (sizes.length === 2 ? ITEMS_FROM : OPEN_FROM) / sizes[1] : Infinity;
  const stops = [Math.min(fitted * PAST_FIT, second * PAST_FIRST)];
  for (let depth = 1; depth < sizes.length; depth++) {
    const s = scaleToOpen(sizes, depth);
    if (s > (stops[stops.length - 1] as number) * 1.01) stops.push(s);
  }
  return stops;
}

/** `view` zoomed to `scale`, keeping the point under `at` (screen pixels) where it is. */
export function zoomTo(view: View, scale: number, at: [number, number]): View {
  const [px, py] = at;
  return { ...view, scale, x: view.x + px / view.scale - px / scale, y: view.y + py / view.scale - py / scale };
}

/** `view` zoomed by `ratio` at `at`, kept between the fitted view and a little past the last level. */
function zoomBy(view: View, stops: readonly number[], ratio: number, at: [number, number]): View {
  const least = stops[0] ?? view.scale,
    most = (stops[stops.length - 1] ?? view.scale) * DEEPEST;
  return zoomTo(view, Math.min(most, Math.max(least, view.scale * ratio)), at);
}

/**
 * `view` zoomed smoothly by a wheel or trackpad movement of `delta` pixels at `at` (negative is in). The point under
 * the pointer stays where it is.
 */
export const wheelView = (view: View, stops: readonly number[], delta: number, at: [number, number]): View =>
  zoomBy(view, stops, Math.exp(-Math.max(-MOST_PIXELS, Math.min(MOST_PIXELS, delta)) * PER_PIXEL), at);

/** `view` zoomed by `ratio` at `at`, as two fingers spread or draw together. */
export const pinchView = (view: View, stops: readonly number[], ratio: number, at: [number, number]): View =>
  zoomBy(view, stops, ratio, at);

/** `view` moved by `dx`, `dy` screen pixels: the drawing follows the pointer. */
export const panView = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x - dx / view.scale,
  y: view.y - dy / view.scale,
});

/** How far past a dot, in screen pixels, a click or tap still picks it: about a fingertip. */
const REACH = 8;

/**
 * What a click or tap at `x`, `y` (screen pixels) picks among `marks`, by key. The name on top comes first. Then the
 * nearest dot within reach, then the smallest cloud round the point. Null on empty space. Picking reads the marks, never the
 * page or the painter (rule 1, one way down).
 */
export function pickAt(marks: readonly Mark[], x: number, y: number): string | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i] as Mark;
    if (m.kind === 'label' && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return m.key;
  }
  let best: { key: string; d: number } | null = null;
  for (const m of marks)
    if (m.kind === 'dot') {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= m.r + REACH && (!best || d < best.d)) best = { key: m.key, d };
    }
  if (best) return best.key;
  let cloud: { key: string; r: number } | null = null;
  for (const m of marks)
    if (m.kind === 'cloud' && Math.hypot(m.x - x, m.y - y) <= m.r && (!cloud || m.r < cloud.r))
      cloud = { key: m.key, r: m.r };
  return cloud?.key ?? null;
}

/** `view` at `scale` (its own when none), with `spot` in the middle of the part the controls leave clear. */
export function centreOn(view: View, spot: Spot, scale = view.scale): View {
  const c = view.clear ?? OPEN;
  const [cx, cy] = [c.left + (view.w - c.left - c.right) / 2, c.top + (view.h - c.top - c.bottom) / 2];
  return { ...view, scale, x: spot.x - cx / scale, y: spot.y - cy / scale };
}

/** The view `t` of the way from `a` to `b` (0 to 1), eased, its zoom changing evenly to the eye: one glide. */
export function glideView(a: View, b: View, t: number): View {
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const scale = a.scale * (b.scale / a.scale) ** e;
  // the middle of the screen moves straight from where it was to where it goes
  const [mx, my] = [a.w / 2, a.h / 2];
  const from = [a.x + mx / a.scale, a.y + my / a.scale] as const,
    to = [b.x + mx / b.scale, b.y + my / b.scale] as const;
  const [px, py] = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
  const glided = { ...b, scale, x: px - mx / scale, y: py - my / scale };
  // the camera tips and turns on the way too, so going into 2.5D or back to flat is one glide
  if (!a.tilt && !b.tilt && !a.turn && !b.turn && !a.lift && !b.lift) return glided;
  const along = (p: number | undefined, q: number | undefined) => (p ?? 0) + ((q ?? 0) - (p ?? 0)) * e;
  return { ...glided, tilt: along(a.tilt, b.tilt), turn: along(a.turn, b.turn), lift: along(a.lift, b.lift) };
}
