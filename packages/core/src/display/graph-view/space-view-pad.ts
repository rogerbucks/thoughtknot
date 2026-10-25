// The 3D view's own buttons and help line (editor spec §53, scale_space_view), for space-view-panel.ts. The buttons
// turn and tilt the view, for those who would rather press than drag. One more switches how it is shown
// in 3D. The help line says how to move it, in short steps, and touch screens get the touch words.
//
// And the glide between the flat drawing and the view (space_glide; Roger, 24 Oct 2026: a smooth change between views).
// The view opens seen from straight above, as flat as the drawing it lies over, and fades in. Then the camera glides
// down to its slant, and the drawing seems to rise into depth. Leaving, the view fades out over the flat drawing.
// Where motion is to be still, it opens and closes at once.
import { word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import { KEY_STEP, between, fromAbove } from '../../space-controls.ts';
import type { SpaceMove } from '../../space-controls.ts';
import type { Orbit } from '../../space-view.ts';
import { button } from '../button.ts';
import { reducedMotion } from './details-nav.ts';

/** What the button that changes how it is shown says, for each way: as cards, in space, or lifted. */
export const DEPTH_WORDS = ['space.cards', 'space.spread', 'space.height-groups', 'space.height-links'] as const;

/** The help line's steps, with a mouse or trackpad. */
const MOUSE_HELP = [
  'space.help-drag',
  'space.help-move',
  'space.help-zoom',
  'space.help-pick',
  'space.help-keys',
] as const;
/** The help line's steps, on a touch screen. */
const TOUCH_HELP = ['space.help-finger', 'space.help-fingers', 'space.help-tap'] as const;

/** Whether the hints were shown before. Kept in the browser, and not at all where it cannot be (a private window). */
function hintsSeen(win: Window): boolean {
  try {
    const seen = win.localStorage.getItem('thoughtknot-space-hints') === 'seen';
    win.localStorage.setItem('thoughtknot-space-hints', 'seen');
    return seen;
  } catch {
    return false;
  }
}

/** Each thing's count of links, by its key: what height means when it means links. */
export function linkCounts(marks: readonly DrawMark[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of marks)
    if (m.kind === 'link')
      for (const end of [m.from, m.to]) if (end !== undefined) counts.set(end, (counts.get(end) ?? 0) + 1);
  return counts;
}

/**
 * Builds the view's buttons and help line in `el`. Each button makes its `move`; the one named `shown` calls `next`,
 * to show it the next way. Gives back that button, the help line, and how to show or hide it.
 */
export function spacePad(el: HTMLElement, shown: string, move: (m: SpaceMove) => void, next: () => void) {
  const pad = el.createDiv({
    cls: 'thoughtknot-space-pad',
    attr: { role: 'toolbar', 'aria-label': word('space.moves') },
  });
  button(pad, word('space.turn-left'), 'rotate-ccw', () => move({ turn: [-KEY_STEP * 2, 0] }));
  button(pad, word('space.turn-right'), 'rotate-cw', () => move({ turn: [KEY_STEP * 2, 0] }));
  button(pad, word('space.tilt-up'), 'chevron-up', () => move({ turn: [0, -KEY_STEP] }));
  button(pad, word('space.tilt-down'), 'chevron-down', () => move({ turn: [0, KEY_STEP] }));
  const depthButton = button(pad, shown, 'bar-chart-3', next);
  const helpButton = button(pad, word('space.help'), 'help-circle', () => move({ help: true }));
  const help = el.createEl('ul', { cls: 'thoughtknot-space-help' });
  const touch = el.win.matchMedia?.('(pointer: coarse)').matches ?? false;
  for (const key of touch ? TOUCH_HELP : MOUSE_HELP) help.createEl('li', { text: word(key) });
  const showHelp = (show: boolean) => {
    help.hidden = !show;
    helpButton.setAttribute('aria-pressed', String(show));
  };
  // the hints show the first time, then only behind the ? button (Roger, 25 Oct 2026: a crowded strip)
  const seen = hintsSeen(el.win);
  showHelp(!seen);
  return { depthButton, showHelp, help };
}

/** How long the camera takes to glide from above to its slant, in milliseconds. */
export const GLIDE_MS = 700;
/** How long the view takes to fade out over the flat drawing, in milliseconds: the token --gn-motion-fade. */
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
