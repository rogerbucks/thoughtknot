// How the 3D view is moved (editor spec §53, scale_space_controls). Roger, 23 Oct 2026: the controls were unclear. You
// could only turn and zoom round the middle, and nothing on screen said how.
//
// So every move has a mouse way, a touch way, a key and a button, and the view says so on screen:
// - turn: drag, one finger, the arrow keys, or the turn buttons;
// - move across: Shift-drag or right-drag, two fingers, Shift and the arrow keys;
// - twist: two fingers turning round each other turn the view round, as the drawing follows them;
// - zoom: scroll, pinch, + and -, or the zoom buttons;
// - show it all again: Home, 0, or Reset view.
// A click on a thing or a link makes it the point the view turns round and zooms to (Roger, 24 Oct 2026). The camera
// stays where it is and turns to face it, so nothing jumps.
// The sums live here, so they are tested without a screen. Host-free and pure.
import { FIELD, eyeOf, orbitBy, upOf, zoomBy } from './space-view.ts';
import type { Orbit, Vec3 } from './space-view.ts';

/** How far a key press turns, tilts or moves the camera, as a drag of this many pixels would. */
export const KEY_STEP = 24;
/** How much one press of + or - zooms. */
export const ZOOM_STEP = 1.6;

/**
 * `orbit` moved across the floor by a drag of `dx` and `dy` pixels on a screen `height` pixels high. What is under
 * the pointer follows it: drag right and the drawing goes right; drag down and it comes nearer. The camera keeps its
 * turn, tilt and distance.
 */
export function panBy(orbit: Orbit, dx: number, dy: number, height: number): Orbit {
  // how far one pixel is, in the space, at the point the camera looks at
  const unit = (2 * orbit.distance * Math.tan(FIELD / 2)) / Math.max(1, height);
  // seen from above, a pixel down the screen is one pixel along the floor; seen low, it is many more
  const along = unit / Math.max(0.25, Math.abs(Math.sin(orbit.tilt)));
  const c = Math.cos(orbit.turn),
    s = Math.sin(orbit.turn);
  // the camera's right on the floor is (-s, c), and its forward, away from the eye, is (-c, -s)
  const [x, y, z] = orbit.target;
  return {
    ...orbit,
    target: [x + s * dx * unit - c * dy * along, y - c * dx * unit - s * dy * along, z],
  };
}

/** One move the view makes. */
export type SpaceMove =
  | { turn: [number, number] }
  | { pan: [number, number] }
  | { zoom: number }
  | { reset: true }
  | { help: true }
  | { back: true };

/** The move a key makes, or null for a key the view leaves alone. `shift` says whether Shift is held. */
export function keyMove(key: string, shift: boolean): SpaceMove | null {
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-KEY_STEP, 0],
    ArrowRight: [KEY_STEP, 0],
    ArrowUp: [0, -KEY_STEP],
    ArrowDown: [0, KEY_STEP],
  };
  const arrow = arrows[key];
  // Shift and an arrow moves the view the way the arrow points, as in a map: the drawing slides the other way
  if (arrow) return shift ? { pan: [0 - arrow[0], 0 - arrow[1]] } : { turn: arrow };
  if (key === '+' || key === '=') return { zoom: ZOOM_STEP };
  if (key === '-' || key === '_') return { zoom: 1 / ZOOM_STEP };
  if (key === 'Home' || key === '0') return { reset: true };
  if (key === '?') return { help: true };
  if (key === 'Escape') return { back: true };
  return null;
}

/** A finger on the screen, at a pixel. */
export interface Touch {
  x: number;
  y: number;
}

/**
 * What two fingers did as they moved from `was` to `now`. It gives how far their middle moved, and how much to zoom:
 * spreading them apart zooms in.
 */
export function twoFingers(
  was: readonly [Touch, Touch],
  now: readonly [Touch, Touch],
): { dx: number; dy: number; zoom: number } {
  const middle = (t: readonly [Touch, Touch]) => [(t[0].x + t[1].x) / 2, (t[0].y + t[1].y) / 2] as const;
  const apart = (t: readonly [Touch, Touch]) => Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
  const [x0, y0] = middle(was),
    [x1, y1] = middle(now);
  const before = apart(was);
  return { dx: x1 - x0, dy: y1 - y0, zoom: before > 0 ? apart(now) / before : 1 };
}

/**
 * `orbit` turned by one finger dragging `dx` and `dy` pixels. A finger turns the way it goes. The drawing beyond the
 * middle follows it sideways (Roger, 25 Oct 2026: on iPhone one finger went the wrong way). A mouse drags the camera
 * round, `orbitBy`.
 */
export function fingerTurn(orbit: Orbit, dx: number, dy: number): Orbit {
  return orbitBy(orbit, -dx, dy);
}

/** How far the line between two fingers turned as they moved from `was` to `now`, in radians; clockwise on screen is positive. */
export function twistOf(was: readonly [Touch, Touch], now: readonly [Touch, Touch]): number {
  const line = (t: readonly [Touch, Touch]) => Math.atan2(t[1].y - t[0].y, t[1].x - t[0].x);
  const d = line(now) - line(was);
  return d - Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
}

/** `orbit` turned round the up line by `angle`, so that a drawing seen from above turns with two fingers twisting. */
export function twistBy(orbit: Orbit, angle: number): Orbit {
  return { ...orbit, turn: orbit.turn + angle };
}

/**
 * `orbit` zoomed by `times`, toward the point of the screen at `nx` and `ny`. Each runs from -1 to 1, with up and to the
 * right positive, on a screen `aspect` wide to each unit high. What is under that point stays under it, as a map zooms
 * to the pointer or to the middle of a pinch. At 0 and 0 it is `zoomBy`.
 */
export function zoomToward(orbit: Orbit, times: number, nx: number, ny: number, aspect: number): Orbit {
  const nearer = zoomBy(orbit, times),
    k = orbit.distance / nearer.distance;
  const eye = eyeOf(orbit);
  const f = unit([0, 1, 2].map((i) => (orbit.target[i] ?? 0) - (eye[i] ?? 0)) as Vec3),
    up = upOf(orbit);
  const right = unit([f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]);
  const above = unit([
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0],
  ]);
  // how far the pointer is from the middle, in the space, at the depth of what the camera looks at
  const reach = orbit.distance * Math.tan(FIELD / 2);
  const shift = (1 - 1 / k) * reach;
  const target = [0, 1, 2].map(
    (i) => (orbit.target[i] ?? 0) + shift * (nx * aspect * (right[i] ?? 0) + ny * (above[i] ?? 0)),
  ) as Vec3;
  return { ...nearer, target };
}

/** `zoomToward` for the pixel `x`, `y` of a screen `width` by `height` pixels. */
export function zoomAtPixel(orbit: Orbit, times: number, x: number, y: number, width: number, height: number): Orbit {
  return zoomToward(orbit, times, (2 * x) / width - 1, 1 - (2 * y) / height, width / height);
}

/**
 * `orbit` moved as two fingers went from `was` to `now`. The screen is `width` by `height` pixels, with its top left at
 * `at`. The view moves across with them, zooms toward their middle and turns as they twist.
 */
export function pinchBy(
  orbit: Orbit,
  was: readonly [Touch, Touch],
  now: readonly [Touch, Touch],
  at: { left: number; top: number },
  width: number,
  height: number,
): Orbit {
  const { dx, dy, zoom } = twoFingers(was, now);
  const x = (now[0].x + now[1].x) / 2 - at.left,
    y = (now[0].y + now[1].y) / 2 - at.top;
  return twistBy(zoomAtPixel(panBy(orbit, dx, dy, height), zoom, x, y, width, height), twistOf(was, now));
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

/**
 * `orbit` turned to look at `point`, which it then turns round and zooms to. The camera stays where it is, so what it
 * sees turns to face the point rather than leaping to it. Called with `share` under 1, it looks only that share of the
 * way from what it looked at, so the turn can glide.
 */
export function orbitAround(orbit: Orbit, point: Vec3, share = 1): Orbit {
  const eye = eyeOf(orbit);
  const t = Math.min(1, Math.max(0, share));
  const target: Vec3 = [0, 1, 2].map(
    (k) => (orbit.target[k] ?? 0) + ((point[k] ?? 0) - (orbit.target[k] ?? 0)) * t,
  ) as Vec3;
  const v: Vec3 = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
  const distance = Math.max(1, Math.hypot(...v));
  // turned over the top, the camera stays so: its tilt past straight up, its turn the other way round
  const over = Math.cos(orbit.tilt) < 0;
  const rise = Math.asin(Math.max(-1, Math.min(1, v[2] / distance)));
  const flat = Math.hypot(v[0], v[1]) > 1e-9 ? Math.atan2(v[1], v[0]) : orbit.turn + (over ? Math.PI : 0);
  return over
    ? { target, distance, turn: flat + Math.PI, tilt: Math.PI - rise }
    : { target, distance, turn: flat, tilt: rise };
}

/** Just short of straight down, so the camera still knows which way is up: the drawing's top, as on the page. */
const ABOVE = Math.PI / 2 - 1e-3;

/**
 * `orbit` seen from straight above: the drawing lies flat as it does in 2D, its top at the top of the screen. The view
 * in space starts so, then glides to `orbit`, and so seems to rise out of the flat drawing (space_glide).
 */
export function fromAbove(orbit: Orbit): Orbit {
  return { ...orbit, tilt: ABOVE };
}

/** The camera `share` of the way from `from` to `to`, eased so it starts and stops gently: 0 is `from`, 1 is `to`. */
export function between(from: Orbit, to: Orbit, share: number): Orbit {
  const t = Math.min(1, Math.max(0, share)),
    e = t * t * (3 - 2 * t);
  const at = (a: number, b: number) => a + (b - a) * e;
  return {
    target: [0, 1, 2].map((k) => at(from.target[k] ?? 0, to.target[k] ?? 0)) as Vec3,
    distance: at(from.distance, to.distance),
    turn: at(from.turn, to.turn),
    tilt: at(from.tilt, to.tilt),
  };
}

/** `v` turned by `angle` radians round the line through the origin along the unit `axis` (Rodrigues' rotation). */
function turned(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const [x, y, z] = axis,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const along = (x * v[0] + y * v[1] + z * v[2]) * (1 - c);
  return [
    v[0] * c + (y * v[2] - z * v[1]) * s + x * along,
    v[1] * c + (z * v[0] - x * v[2]) * s + y * along,
    v[2] * c + (x * v[1] - y * v[0]) * s + z * along,
  ];
}

/**
 * `orbit` turned and tilted by a drag of `dx` and `dy` pixels, as `orbitBy` turns it, but round `pivot`. The camera and
 * the point it looks at both swing round it, so the view does not jump. The picked thing, or the drawing's middle,
 * stays where it is on the screen while all else turns round it (Roger, 25 Oct 2026).
 */
export function turnRound(orbit: Orbit, dx: number, dy: number, pivot: Vec3): Orbit {
  // seen upside down, the upright line points down the screen, so the same drag turns the other way unless it is reversed
  const spin = -dx * 0.008 * (Math.cos(orbit.tilt) < 0 ? -1 : 1),
    lift = dy * 0.008;
  const off: Vec3 = [0, 1, 2].map((k) => (orbit.target[k] ?? 0) - (pivot[k] ?? 0)) as Vec3;
  // first round the upright line through the pivot, then round the level line square to the new way the camera looks
  const spun = turned(off, [0, 0, 1], spin),
    turn = orbit.turn + spin;
  const lifted = turned(spun, [Math.sin(turn), -Math.cos(turn), 0], lift);
  return {
    target: [pivot[0] + lifted[0], pivot[1] + lifted[1], pivot[2] + lifted[2]],
    distance: orbit.distance,
    turn,
    tilt: orbit.tilt + lift,
  };
}

type TouchLike = { stopPropagation(): void; touches: { length: number } };
/**
 * A touch in the view goes no further, so the host's own swipes never take it. The touches really down also settle the
 * pointers tracked, keeping the newest. A lift that never arrived must not leave one. Else the next single finger
 * would pinch instead of turn (stuck_touch).
 */
export const touchesStay = (
  el: { addEventListener(type: string, fn: (e: TouchLike) => void, o: object): void },
  down: Map<number, unknown>,
): void => {
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
    el.addEventListener(
      type,
      (e) => {
        e.stopPropagation();
        const fingers = e.touches.length;
        if (type !== 'touchmove')
          for (const id of [...down.keys()].slice(0, Math.max(0, down.size - fingers))) down.delete(id);
      },
      { passive: true },
    );
};
