// The change between the flat drawing and the view in space glides (editor spec §53, space_glide). Roger, 24 Oct 2026:
// a smooth change between views. The view opens seen from straight above, as flat as the drawing it lies over, and
// fades in. Then the camera glides down to its slant, and the drawing seems to rise into depth. Leaving, the view fades
// out over the flat drawing. Where motion is to be still, it opens and closes at once.
import { between, fromAbove } from '../../space-controls.ts';
import type { Orbit } from '../../space-view.ts';
import { reducedMotion } from './details-nav.ts';

/** How long the camera takes to glide from above to its slant, in milliseconds. */
export const GLIDE_MS = 700;
/** How long the view takes to fade out over the flat drawing, in milliseconds; styles.css fades it in. */
export const FADE_MS = 200;

/** What stops the glide at once: the person reaching for the view, to turn, move, zoom or pick. */
const MOVES = ['pointerdown', 'wheel', 'keydown'] as const;

/**
 * Glides the camera of the view `el` from above the drawing to `to`, through `set`. The person reaching for the view
 * stops it at once, where it is.
 */
export function glideIn(el: HTMLElement, to: Orbit, set: (o: Orbit) => void): void {
  const win = el.win;
  if (reducedMotion(win)) return;
  const from = fromAbove(to),
    start = win.performance.now();
  let moved = false;
  const stop = () => {
    moved = true;
    for (const type of MOVES) el.removeEventListener(type, stop, true);
  };
  for (const type of MOVES) el.addEventListener(type, stop, true);
  set(from);
  const step = (now: number) => {
    if (moved) return;
    const t = Math.min(1, (now - start) / GLIDE_MS);
    set(between(from, to, t));
    if (t < 1) win.requestAnimationFrame(step);
    else stop();
  };
  win.requestAnimationFrame(step);
}

/** Fades the view `el` out, then runs `gone`; at once where motion is to be still. */
export function fadeOut(el: HTMLElement, gone: () => void): void {
  if (reducedMotion(el.win)) return gone();
  el.addClass('is-leaving');
  el.win.setTimeout(gone, FADE_MS);
}
