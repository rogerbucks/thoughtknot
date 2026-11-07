// The tilted camera: phase P3 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_one_camera). 2.5D
// and 3D look at the same marks as 2D, from an angle (Roger, 7 Nov 2026: "I hate the old look. Fix it."). The drawing
// lies on the ground. The camera tips back by `tilt` and turns round the screen's middle by `turn`. Far things are
// smaller and near things bigger. Nothing moves in the drawing: only the eye does (nodes stay put). With no tilt and
// no turn the picture is the flat one, pixel for pixel. Host-free and pure.
import type { View } from './render-marks.ts';

/** How far the eye stands from the screen, as a share of the screen's longer side: far enough to look calm. */
const EYE = 1.6;
/** The nearest a point may come to the eye, as a share of its distance, so nothing swells without end. */
const NEAREST = 0.2;

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
