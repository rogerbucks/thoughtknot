// A change of layout glides each thing from where it was to where it goes (editor spec §68, layout_glide; Roger,
// 25 Oct 2026). The new spots are lined up with the old first, so the drawing does not spin or jump. That is the
// turn, the flip and the shift that bring the new spots nearest the old (Procrustes alignment, least squares). Only
// what is left over moves. Where motion is to be still, the end shows at once: the host asks that.
// Pure: the host moves the things.

/** A spot on the drawing or the screen. */
export type Pt = readonly [number, number];

/** How long the glide takes, in milliseconds: long enough to follow a thing, short enough not to wait for. */
export const LAYOUT_GLIDE_MS = 420;

/** Past this many things a layout shows at once: so many moving at once can be neither followed nor drawn smoothly. */
export const GLIDE_MOST = 1500;

/** The least a thing moves, in pixels, to count as moved. */
export const MOVED_PX = 0.5;

/**
 * The turn, flip and shift that bring a new layout's spots nearest the old: a spot `p` of the new goes to
 * `turn(flip(p - from)) + to`. `turn` is in radians, the flip mirrors across, and `from`, `to` are the middles of the
 * things in both.
 */
export interface LineUp {
  turn: number;
  flip: boolean;
  from: Pt;
  to: Pt;
}

/** No change: what lines up a layout with nothing in common with the last, or with itself. */
export const AS_IS: LineUp = { turn: 0, flip: false, from: [0, 0], to: [0, 0] };

/** The middle of `keys`' spots in `at`. */
function middle(at: ReadonlyMap<string, Pt>, keys: readonly string[]): Pt {
  let x = 0,
    y = 0;
  for (const k of keys) {
    const [px, py] = at.get(k) as Pt;
    x += px;
    y += py;
  }
  return [x / keys.length, y / keys.length];
}

/**
 * How `now`, a new layout's spots, lines up best with `was`, the old one's, by the things in both. With `turns`
 * false, it is shifted only: a layout whose rows run one way keeps them so. A flip is taken only where it fits
 * clearly better, so a layout that fits as well either way is never mirrored.
 */
export function lineUp(was: ReadonlyMap<string, Pt>, now: ReadonlyMap<string, Pt>, turns = true): LineUp {
  const both = [...now.keys()].filter((k) => was.has(k));
  if (!both.length) return AS_IS;
  const to = middle(was, both),
    from = middle(now, both);
  if (!turns || both.length < 2) return { turn: 0, flip: false, from, to };
  // the best turn of the new onto the old, mirrored or not. Its angle is that of the sums of a·b and a×b
  const best = (flip: boolean) => {
    let dot = 0,
      cross = 0,
      spread = 0;
    for (const k of both) {
      const [ax, ay] = was.get(k) as Pt,
        [bx0, by] = now.get(k) as Pt;
      const [px, py] = [ax - to[0], ay - to[1]],
        [qx, qy] = [(flip ? -1 : 1) * (bx0 - from[0]), by - from[1]];
      dot += px * qx + py * qy;
      cross += qx * py - qy * px;
      spread += px * px + py * py + qx * qx + qy * qy;
    }
    // what is left over after the best turn: the spread less twice how well they agree
    return { turn: Math.atan2(cross, dot), left: spread - 2 * Math.hypot(dot, cross) };
  };
  const plain = best(false),
    mirrored = best(true);
  const flip = mirrored.left < plain.left * 0.9;
  return { turn: (flip ? mirrored : plain).turn, flip, from, to };
}

/** Where `p`, a spot of the new layout, goes once lined up with the old as `by` says. */
export function linedUp(p: Pt, by: LineUp): Pt {
  const x = (by.flip ? -1 : 1) * (p[0] - by.from[0]),
    y = p[1] - by.from[1];
  const c = Math.cos(by.turn),
    s = Math.sin(by.turn);
  return [c * x - s * y + by.to[0], s * x + c * y + by.to[1]];
}

/** Eased in and out, so a thing sets off and arrives gently: 0 at 0, 1 at 1. */
export const easeGlide = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/** How far each thing of a glide has still to go: its offset from where it ends, by its key. */
export type Offsets = Map<string, Pt>;

/**
 * Where each thing starts its glide, as an offset from where it ends. On the screen, `was` is where it was and `now`
 * is where it goes. A thing new to the drawing has none: it fades in where it goes. None moved, none is given.
 */
export function offsetsOf(was: ReadonlyMap<string, Pt>, now: ReadonlyMap<string, Pt>): Offsets {
  const out: Offsets = new Map();
  for (const [k, [x, y]] of now) {
    const from = was.get(k);
    if (!from) continue;
    const d: Pt = [from[0] - x, from[1] - y];
    if (Math.hypot(d[0], d[1]) >= MOVED_PX) out.set(k, d);
  }
  return out;
}

/** The offset of a thing a fraction `t` of the way through its glide: all of it at 0, none from 1. */
export function offsetAt(d: Pt, t: number): Pt {
  const left = 1 - easeGlide(t);
  return left ? [d[0] * left, d[1] * left] : [0, 0];
}

/**
 * The shift of the view that keeps the person's place across a new layout (r_keep_place). What they had selected
 * stays where it was on the screen. Else the things in both keep their middle where it was. What `pinned` says
 * stays (layout_strategy_variables): the selected thing, as here, the middle alone, or nothing.
 */
export function placeKept(
  was: ReadonlyMap<string, Pt>,
  now: ReadonlyMap<string, Pt>,
  selected?: string | null,
  pinned: 'selected' | 'middle' | 'nothing' = 'selected',
): Pt | null {
  if (pinned === 'nothing') return null;
  const a = selected && pinned === 'selected' ? was.get(selected) : undefined,
    b = selected && pinned === 'selected' ? now.get(selected) : undefined;
  if (a && b) return [a[0] - b[0], a[1] - b[1]];
  const by = lineUp(was, now, false);
  if (by === AS_IS) return null;
  return [by.to[0] - by.from[0], by.to[1] - by.from[1]];
}
