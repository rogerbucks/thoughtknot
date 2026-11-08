// The stage's side of a diagram type change (editor spec §73, render_type_morph). The old stage says where each thing
// was on the screen. The new one starts each thing there and glides it to its new place, the view held still. So the
// reader sees where everything went, and nothing jumps (Roger, 8 Nov 2026).
import type { View } from '../../render/render-marks.ts';
import { MORPH_MS, morphed } from '../../render/render-morph.ts';
import type { Spot } from '../../render/render-rooms.ts';
import { isTilted, onScreen } from '../../render/render-tilt.ts';
import { isGlobe } from '../../render/render-globe.ts';

/** What a stage showed: its view's middle and zoom, and each thing's place, all in the card's own pixels. */
export interface Seen {
  view: { cx: number; cy: number; k: number };
  from: Map<string, { x: number; y: number }>;
}

/** What a stage with `view` and `spots` shows now, for the stage that takes its place. */
export function seenOf(view: View, spots: ReadonlyMap<string, Spot>): Seen {
  const from = new Map<string, { x: number; y: number }>();
  for (const [key, spot] of spots) {
    const s = onScreen(spot, view);
    if (!('behind' in s && s.behind)) from.set(key, { x: s.x, y: s.y });
  }
  return { view: { cx: view.x + view.w / 2 / view.scale, cy: view.y + view.h / 2 / view.scale, k: view.scale }, from };
}

/**
 * Glides `spots` from where `seen` had each thing on the screen to its own place, under `view`, drawing each frame.
 * It draws once and stops where there is nothing to glide: nothing seen, a tilted view or the globe, or no frames.
 */
export function morphIn(spots: Map<string, Spot>, view: View, seen: Seen | undefined, draw: () => void): void {
  const frame = typeof requestAnimationFrame === 'undefined' ? null : requestAnimationFrame;
  if (!seen?.from.size || !frame || isTilted(view) || isGlobe(view)) return draw();
  const end = new Map(spots);
  // where each thing was on the screen, in the new drawing's own units under the same view
  const from = new Map(
    [...seen.from].map(([k, p]) => [k, { x: p.x / view.scale + view.x, y: p.y / view.scale + view.y }]),
  );
  const start = performance.now();
  const step = (now: number): void => {
    const t = (now - start) / MORPH_MS;
    for (const [k, s] of morphed(from, end, t)) spots.set(k, s);
    draw();
    if (t < 1) frame(step);
  };
  step(start);
}
