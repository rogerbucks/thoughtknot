// The camera: layer L6 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_one_camera). One camera
// for the new rendering: it fits the drawing, pans, and zooms in steps. Each wheel notch or pinch goes to the next stop,
// and each stop is the zoom that opens one more level. So one notch moves one level, never two (Roger, 5 Nov).
// Host-free and pure.
import { scaleToOpen } from './render-detail.ts';
import type { View } from './render-marks.ts';
import type { Clear } from '../zoom-fit.ts';
import type { Spot } from './render-rooms.ts';

/** The space left round the drawing when it is fitted, in pixels. */
const MARGIN = 24;
/** Past the last level, each notch zooms in by this much, up to `DEEPEST` times the last stop. */
const BEYOND = 1.5;
const DEEPEST = 4;
/** One notch zooms by at most this much, so the reader keeps their place; a deep level may take two notches. */
const MOST = 2;

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

/** One notch in (`dir` 1) or out (`dir` -1) at `at`: toward the next stop, never past it, so at most one level changes. */
export function stepView(view: View, stops: readonly number[], dir: 1 | -1, at: [number, number]): View {
  const last = stops[stops.length - 1] as number;
  let scale: number;
  if (dir > 0) {
    const next = stops.find((s) => s > view.scale * 1.01) ?? Math.min(view.scale * BEYOND, last * DEEPEST);
    scale = Math.min(next, view.scale * MOST);
  } else {
    const before = [...stops].reverse().find((s) => s < view.scale * 0.99) ?? stops[0] ?? view.scale;
    scale = Math.max(before, view.scale / MOST);
  }
  return zoomTo(view, scale, at);
}

/** `view` moved by `dx`, `dy` screen pixels: the drawing follows the pointer. */
export const panView = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x - dx / view.scale,
  y: view.y - dy / view.scale,
});
