// The glide of the new rendering's stage from one view to another (editor spec §73; never disorient, rule 7). The
// reader sees where they went. When they ask for less motion, or the window draws no frames, it goes there at once.
import { glideView } from '../../render/render-camera.ts';
import type { View } from '../../render/render-marks.ts';

/** How long a glide to a picked thing takes, in milliseconds. */
export const GLIDE_MS = 260;

/**
 * Glides from `from` to `to`, showing each frame by `show`. It stops as soon as `current` says a newer move took over,
 * such as the reader's own zoom.
 */
export function glide(win: Window | undefined, from: View, to: View, show: (v: View) => void, current: () => boolean) {
  const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (still || !win?.requestAnimationFrame) return show(to);
  const start = Date.now();
  const frame = () => {
    if (!current()) return;
    const t = Math.min(1, (Date.now() - start) / GLIDE_MS);
    show(t < 1 ? glideView(from, to, t) : to);
    if (t < 1) win.requestAnimationFrame(frame);
  };
  win.requestAnimationFrame(frame);
}

/** How far 2.5D and 3D tip the camera back, in radians: the ground at a slant, its far side still easy to read. */
const TILTS: Record<string, number> = { cards: 0.6, balls: 0.8 };
/** How high each level stands in 2.5D and 3D: 2.5D lies on the ground, 3D stands each level on the one that holds it. */
const LIFTS: Record<string, number> = { cards: 0, balls: 1 };

/** The angle the stage looks from for the bar's `mode`: flat for none, null for a mode the stage leaves to space. */
export function angleOf(mode: string | null): { tilt: number; lift: number } | null {
  const tilt = mode ? TILTS[mode] : 0;
  return tilt === undefined ? null : { tilt, lift: (mode && LIFTS[mode]) || 0 };
}
