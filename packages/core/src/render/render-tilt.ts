// The tilted camera: phase P3 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_one_camera). 2.5D
// and 3D look at the same marks as 2D, from an angle (Roger, 7 Nov 2026: "I hate the old look. Fix it."). The drawing
// lies on the ground. The camera tips back by `tilt` and turns round the screen's middle by `turn`. Far things are
// smaller and near things bigger. Nothing moves in the drawing: only the eye does (nodes stay put). With no tilt and
// no turn the picture is the flat one, pixel for pixel. Host-free and pure.
import type { GroundMark, View } from './render-marks.ts';
import type { Look } from './render-look.ts';
import type { Spot } from './render-rooms.ts';
import { archOver, ballOf, isGlobe, onGlobe } from './render-globe.ts';

/** How far the eye stands from the screen, as a share of the screen's longer side: far enough to look calm. */
const EYE = 1.6;
/** The nearest a point may come to the eye, as a share of its distance, so nothing swells without end. */
const NEAREST = 0.2;

/** How high one level stands in 3D, in pixels on the screen, when the view's `lift` is 1. */
const LEVEL_PX = 14;

/** The spacing of the ground's grid on the screen, roughly, in pixels. */
const GRID_PX = 90;

/** A point on the screen as the tilted camera sees it, and how much nearer than the screen it is (1 on the screen). */
export interface Seen {
  x: number;
  y: number;
  k: number;
}

/** Whether `view` looks from an angle at all. */
export const isTilted = (view: View): boolean => !!view.tilt || !!view.turn;

/**
 * The flat screen's point `x`, `y`, lifted `z` pixels off the ground, as the camera tipped back by `view.tilt` and
 * turned by `view.turn` sees it. The middle stays where it is, so a tilt keeps what you look at in front.
 */
export function tilted(x: number, y: number, z: number, view: View): Seen {
  const [t, u] = [view.tilt ?? 0, view.turn ?? 0];
  // it turns about the middle of the part the controls leave clear, where the drawing was fitted
  const c = view.clear ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const [cx, cy] = [c.left + (view.w - c.left - c.right) / 2, c.top + (view.h - c.top - c.bottom) / 2];
  let [dx, dy] = [x - cx, y - cy];
  if (u) [dx, dy] = [dx * Math.cos(u) - dy * Math.sin(u), dx * Math.sin(u) + dy * Math.cos(u)];
  const eye = EYE * Math.max(view.w, view.h, 1);
  // the top of the screen tips away from the eye, and a point lifted off the ground comes nearer
  const away = -dy * Math.sin(t) - z * Math.cos(t);
  const k = eye / Math.max(eye * NEAREST, eye + away);
  return { x: cx + dx * k, y: cy + (dy * Math.cos(t) - z * Math.sin(t)) * k, k };
}

/** How high a thing `depth` levels down stands off the ground: in 3D each level stands on the one that holds it. */
export const heightOf = (view: View, depth: number): number => (view.lift ?? 0) * LEVEL_PX * depth;

/** The highest a road arches in 3D, in levels, however long it is. */
const ARCH_LEVELS = 3;

/**
 * The control point of a road's arch on the screen, between two spots `depth` levels down. There is none unless levels
 * stand. The arch rises a quarter of the road's length, at most three levels.
 */
export function archOf(p: Spot, q: Spot, view: View, depth: number): [number, number] | undefined {
  if (isGlobe(view)) return archOver(p, q, view); // on the globe every road arches over the ball
  const lift = view.lift ?? 0;
  if (!lift || !isTilted(view)) return undefined;
  const flat = (s: Spot): [number, number] => [(s.x - view.x) * view.scale, (s.y - view.y) * view.scale];
  const [[ax, ay], [bx, by]] = [flat(p), flat(q)];
  const rise = lift * Math.min(0.25 * Math.hypot(bx - ax, by - ay), ARCH_LEVELS * LEVEL_PX);
  const top = tilted((ax + bx) / 2, (ay + by) / 2, heightOf(view, depth) + rise, view);
  const [s, t] = [onScreen(p, view, depth), onScreen(q, view, depth)];
  // a curve through the top: its control point stands twice as far from the chord's middle
  return [2 * top.x - (s.x + t.x) / 2, 2 * top.y - (s.y + t.y) / 2];
}

/**
 * Where a spot of the drawing, `depth` levels down, is on the screen, and how big. Flat, it is only zoomed and moved.
 * On the globe it lies round the ball, and `behind` says it is on the far side, out of sight.
 */
export function onScreen(spot: Spot, view: View, depth = 0): Spot & { k?: number; behind?: boolean } {
  if (isGlobe(view)) return onGlobe(spot, view);
  const [x, y, r] = [(spot.x - view.x) * view.scale, (spot.y - view.y) * view.scale, spot.r * view.scale];
  if (!isTilted(view)) return { x, y, r };
  const seen = tilted(x, y, heightOf(view, depth), view);
  return { x: seen.x, y: seen.y, r: r * seen.k };
}

/**
 * The ground the drawing lies on, as the lines of a faint grid on the screen: none while flat. The grid is fixed to
 * the drawing, so it moves as the drawing does, and its spacing halves or doubles as the zoom changes.
 */
export function groundOf(view: View): [number, number, number, number][] {
  if (!isTilted(view) || isGlobe(view)) return [];
  const step = 2 ** Math.round(Math.log2(GRID_PX / view.scale)); // in the drawing's own units
  // the ground seen from an angle reaches past the screen's edges, the far side most
  const [x0, x1] = [view.x - view.w / view.scale, view.x + (2 * view.w) / view.scale];
  const [y0, y1] = [view.y - (2 * view.h) / view.scale, view.y + (2 * view.h) / view.scale];
  const at = (x: number, y: number) => onScreen({ x, y, r: 0 }, view);
  const lines: [number, number, number, number][] = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const [a, b] = [at(x, y0), at(x, y1)];
    lines.push([a.x, a.y, b.x, b.y]);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const [a, b] = [at(x0, y), at(x1, y)];
    lines.push([a.x, a.y, b.x, b.y]);
  }
  return lines;
}

/** The least and most the reader may tip the camera back by hand: never straight down, never edge on. */
const TIPS = [0.2, 1.2] as const;
/** How far a drag of one pixel turns or tips the camera, in radians. */
export const TURN_PER_PX = 0.006;

/** `view` turned by a drag of `dx` pixels across and tipped by `dy` down, as by a drag that turns the camera. */
export function turnedBy(view: View, dx: number, dy: number): View {
  const tilt = Math.min(TIPS[1], Math.max(TIPS[0], (view.tilt ?? 0) + dy * TURN_PER_PX));
  return { ...view, tilt, turn: (view.turn ?? 0) + dx * TURN_PER_PX };
}

/** A drag of `dx`, `dy` on the screen, as a move on the ground the camera looks at: the drawing follows the pointer. */
export function groundShift(view: View, dx: number, dy: number): [number, number] {
  if (!isTilted(view)) return [dx, dy];
  const [t, u] = [view.tilt ?? 0, view.turn ?? 0];
  const down = dy / Math.max(0.2, Math.cos(t)); // the ground is foreshortened up the screen
  return [dx * Math.cos(u) + down * Math.sin(u), -dx * Math.sin(u) + down * Math.cos(u)];
}

/**
 * Whether a wheel event is two fingers moving on a trackpad, not a mouse wheel turning. A trackpad moves in pixels
 * and often sideways. A mouse wheel moves up and down only, in whole notches of 100 or 120.
 */
export function fromTrackpad(e: { deltaMode: number; deltaX: number; deltaY: number }): boolean {
  if (e.deltaMode !== 0) return false;
  const y = Math.abs(e.deltaY);
  return e.deltaX !== 0 || (y > 0 && y % 100 !== 0 && y % 120 !== 0);
}

/** The ground under the marks: a faint grid seen from an angle, or the ball the globe wraps the drawing round. */
export function floorOf(view: View, look: Look): GroundMark[] {
  if (isGlobe(view)) {
    const { disc, lines } = ballOf(view);
    const [x, y, r] = disc;
    return [{ kind: 'ground', lines, fill: look.faint, alpha: 0.5, ball: { x, y, r, paper: look.card } }];
  }
  const lines = groundOf(view);
  return lines.length ? [{ kind: 'ground', lines, fill: look.faint, alpha: 0.5 }] : [];
}
