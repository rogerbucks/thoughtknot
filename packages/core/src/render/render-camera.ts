// The camera: layer L6 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_one_camera). One camera
// for the new rendering: it fits the drawing, pans, and zooms in steps. Each wheel notch or pinch goes to the next stop,
// and each stop is the zoom that opens one more level. So one notch moves one level, never two (Roger, 5 Nov).
// Host-free and pure.
import { scaleToOpen } from './render-detail.ts';
import type { View } from './render-marks.ts';
import type { Spot } from './render-rooms.ts';

/** The space left round the drawing when it is fitted, in pixels. */
const MARGIN = 24;
/** Past the last level, each notch zooms in by this much, up to `DEEPEST` times the last stop. */
const BEYOND = 1.5;
const DEEPEST = 4;

/** The view that fits every spot in a screen `w` by `h`, in the middle. */
export function fitView(spots: Iterable<Spot>, w: number, h: number): View {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of spots) {
    left = Math.min(left, s.x - s.r);
    top = Math.min(top, s.y - s.r);
    right = Math.max(right, s.x + s.r);
    bottom = Math.max(bottom, s.y + s.r);
  }
  if (!Number.isFinite(left)) return { x: 0, y: 0, scale: 1, w, h };
  const scale = Math.min((w - 2 * MARGIN) / (right - left || 1), (h - 2 * MARGIN) / (bottom - top || 1));
  return { x: (left + right) / 2 - w / 2 / scale, y: (top + bottom) / 2 - h / 2 / scale, scale, w, h };
}

/** The zoom stops: the fitted zoom, then the zoom that opens each level, smallest first. */
export function stopsOf(sizes: readonly number[], fitted: number): number[] {
  const stops = [fitted];
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

/** One notch in (`dir` 1) or out (`dir` -1) at `at`: to the next stop, so at most one level changes. */
export function stepView(view: View, stops: readonly number[], dir: 1 | -1, at: [number, number]): View {
  const last = stops[stops.length - 1] as number;
  let scale: number;
  if (dir > 0) scale = stops.find((s) => s > view.scale * 1.01) ?? Math.min(view.scale * BEYOND, last * DEEPEST);
  else scale = [...stops].reverse().find((s) => s < view.scale * 0.99) ?? (stops[0] as number);
  return zoomTo(view, scale, at);
}

/** `view` moved by `dx`, `dy` screen pixels: the drawing follows the pointer. */
export const panView = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x - dx / view.scale,
  y: view.y - dy / view.scale,
});
