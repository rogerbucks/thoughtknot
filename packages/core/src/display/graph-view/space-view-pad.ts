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
import { KEY_STEP, between, fromAbove, nameRoom, orbitAround } from '../../space-controls.ts';
import type { SpaceMove } from '../../space-controls.ts';
import { middleOf, orbitFit } from '../../space-view.ts';
import type { Block, Orbit, SpaceMarks, Vec3 } from '../../space-view.ts';
import { globeFacing, globeOf } from '../../space-globe.ts';
import { dockKey, renderDock } from './controls-dock.ts';
import { fillDock } from './controls-keys.ts';
import { reducedMotion } from './details-nav.ts';
import type { DepthBy } from '../../space-view.ts';
import type { SpaceMode } from './space-view-options.ts';

/** Where the globe is among the ways to show the view: the last, after cards, balls and the two lifts. */
export const GLOBE = 4;

/** The way to show the view for the bar's `mode`: as cards, a globe, or 3D balls, lifted as its own button left it. */
export const depthFor = (mode: SpaceMode, now: number): number =>
  mode === 'cards' ? 0 : mode === 'globe' ? GLOBE : now % GLOBE === 0 ? 1 : now;

/**
 * A way to show the view: as cards (the first, Roger, 24 Oct 2026), as balls in space (null), or on a globe (§71).
 * Or lifted, with height by what DepthBy says.
 */
export type Depth = DepthBy | 'cards' | 'globe' | null;

/** How `marks` shown `by` that way are lifted as they lie; none to lay them out afresh. So too a drawing of no things,
 * as a density view's squares, which has nothing to lay out (space_density_tiles). */
export const liftOf = (by: Depth, marks: readonly DrawMark[]): DepthBy | null =>
  by && by !== 'cards' && by !== 'globe' ? by : marks.some((m) => m.of !== undefined) ? null : { by: 'group' };

/** What the button that changes how it is shown says, for each way: as cards, in space, or lifted. */
export const DEPTH_WORDS = [
  'space.cards',
  'space.spread',
  'space.height-groups',
  'space.height-links',
  'space.globe',
] as const;

/** The way the button goes to from way `depth`: round the lifts; on the globe (the last way), cards swapped for balls. */
function wayAfter(depth: number, globe: { balls: boolean }): number {
  if (depth < DEPTH_WORDS.length - 1) return (depth % (DEPTH_WORDS.length - 2)) + 1;
  globe.balls = !globe.balls;
  return depth;
}

/** What the button says for way `depth`: on the globe (the last way), whether it shows `balls` or cards. */
const wayWord = (depth: number, balls: boolean): string =>
  word(depth === DEPTH_WORDS.length - 1 && balls ? 'space.globe-balls' : (DEPTH_WORDS[depth] ?? 'space.spread'));

/** The ways the drawing is shown in 3D: the one the button goes to next, and what it says for each. */
export const ways = { after: wayAfter, word: wayWord };

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
 * Builds the view's dock and help line in `el`. Each button makes its `move`; the one named `shown` calls `next`, to
 * show it the next way. Its [ key folds the dock. Gives back that button, the help line, how to show or hide it, and
 * where the controls used less go.
 */
export function spacePad(el: HTMLElement, shown: string, move: (m: SpaceMove) => void, next: () => void) {
  // its key controls, in the dock every view shares (controls_keys): help waits under More
  const dock = renderDock(el, word('space.moves'), ['thoughtknot-space-pad']);
  // the view says how it opened, as it says each change: 2.5D and 3D open flat now (phase P3)
  el.querySelector('.thoughtknot-space-said')?.setText(shown);
  const [, , , , depthButton, helpButton] = fillDock(dock, [
    { name: word('space.turn-left'), icon: 'rotate-ccw', run: () => move({ turn: [-KEY_STEP * 2, 0] }) },
    { name: word('space.turn-right'), icon: 'rotate-cw', run: () => move({ turn: [KEY_STEP * 2, 0] }) },
    { name: word('space.tilt-up'), icon: 'chevron-up', run: () => move({ turn: [0, -KEY_STEP] }) },
    { name: word('space.tilt-down'), icon: 'chevron-down', run: () => move({ turn: [0, KEY_STEP] }) },
    { name: shown, icon: 'bar-chart-3', run: next },
    { name: word('space.help'), icon: 'help-circle', run: () => move({ help: true }) },
  ]);
  el.addEventListener('keydown', (e: KeyboardEvent) => dockKey(e) && dock.fold(!dock.folded()));
  // the help is in the pad, above its buttons, so nothing on the view covers it (Roger, 3 Nov 2026)
  const help = dock.el.createEl('ul', { cls: 'thoughtknot-space-help' });
  dock.el.insertBefore(help, dock.body);
  const touch = el.win.matchMedia?.('(pointer: coarse)').matches ?? false;
  for (const key of touch ? TOUCH_HELP : MOUSE_HELP) help.createEl('li', { text: word(key) });
  // the tips close with their own button, and stay closed: the ? button brings them back (Roger, 5 Nov 2026)
  const close = help.createEl('li').createEl('button', {
    cls: 'thoughtknot-space-help-close',
    text: word('space.help-close'),
    attr: { type: 'button' },
  });
  close.addEventListener('click', () => showHelp(false));
  const showHelp = (show: boolean) => {
    help.hidden = !show;
    helpButton?.setAttribute('aria-pressed', String(show));
  };
  // the hints show the first time, then only behind the ? button (Roger, 25 Oct 2026: a crowded strip)
  const seen = hintsSeen(el.win);
  showHelp(!seen);
  return { depthButton: depthButton as HTMLButtonElement, showHelp, help, rare: dock.more };
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

/** How long the view takes to turn to face what was picked, in milliseconds. */
const TURN_TIME = 280;

/**
 * Turns the view from `from` to face `to`: a point, which it then turns round and zooms to, or a camera to glide to.
 * It glides, unless motion is to be still, while `going` says so.
 */
export function turnToward(
  win: Window,
  from: Orbit,
  to: Vec3 | Orbit,
  set: (o: Orbit) => void,
  going: () => boolean,
): void {
  const at = (t: number) => ('target' in to ? between(from, to, t) : orbitAround(from, to, t));
  if (reducedMotion(win)) return set(at(1));
  const start = win.performance.now();
  const step = (now: number) => {
    if (!going()) return;
    const t = Math.min(1, (now - start) / TURN_TIME);
    set(at('target' in to ? t : 1 - (1 - t) * (1 - t)));
    if (t < 1) win.requestAnimationFrame(step);
  };
  win.requestAnimationFrame(step);
}

/** Where the view turns round: the picked thing, else a globe's middle or the middle of all (globe_face_picked). */
export const pivotOf = (space: SpaceMarks, picked: Block | null, onGlobe: boolean): Vec3 =>
  picked && !onGlobe ? middleOf(picked) : (globeOf(space)?.middle ?? orbitFit(space).target);

/** What turning to `point` aims at: the point, or on a globe the camera square on to it, near it with `dive`. */
export function aimOf(onGlobe: SpaceMarks | false, orbit: Orbit, point: Vec3, dive: boolean): Vec3 | Orbit {
  const globe = onGlobe && globeOf(onGlobe);
  return globe ? globeFacing(orbit, globe, point, dive) : point;
}

/** The camera that shows all of `space` on a screen `width` by `height` pixels, its outmost names whole. */
export const fitIn = (space: SpaceMarks, width: number, height: number): Orbit =>
  orbitFit(space, width / height, nameRoom(space, width, height));
