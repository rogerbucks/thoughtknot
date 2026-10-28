// Lenses: projections that bend whatever a view has drawn (editor spec §68, projections_all_on). Roger, 25 Oct 2026:
// "I want all views on". A lens lays nothing out. It moves each spot a view drew round a focus. So the same lens works
// on every view type and layout, flat and in space. A fisheye (projection_fisheye) enlarges the things round the focus.
// It shrinks those nearer its rim, so a person sees detail and the whole at once. What lies beyond its reach does not
// move at all, and nor does the focus: it is never disorienting (ethos principle 8).
//
// A lens is radial: a point at a distance from the focus goes to another distance, the same way. So it bends and
// unbends alike in two dimensions and in three. A tap on a bent drawing is found where it was drawn. Host-free, pure.
import { middleOf } from './space-view.ts';
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';

/** The lenses a view may be seen through, the first being none. */
export const LENSES = ['none', 'fisheye'] as const;
/** One of the lenses. */
export type Lens = (typeof LENSES)[number];

/** How strongly a fisheye bends: 2.5 spreads the things at its focus over twice as far apart (Sarkar and Brown, 1992). */
export const FISHEYE_BEND = 2.5;
/** How far a fisheye reaches on the screen, in pixels, round its focus, at most. */
export const FISHEYE_PX = 220;
/** How far it reaches on a small screen, as a share of the screen's shorter side. */
export const FISHEYE_SHARE = 0.3;

/**
 * A lens round its focus: where a point `r` from the focus goes, as a distance, and how much larger a thing is there. A
 * thing grows less than the room round it, so neighbours pushed apart never cover each other.
 */
export interface Radial {
  focus: readonly number[];
  /** How far it bends: from here out, nothing moves. */
  reach: number;
  out: (r: number) => number;
  times: (r: number) => number;
}

/** A fisheye round `focus`, reaching `reach`: continuous at its rim, where it gives way to the drawing as drawn. */
export function fisheye(focus: readonly number[], reach: number, bend = FISHEYE_BEND): Radial {
  const k0 = (Math.exp(bend) / (Math.exp(bend) - 1)) * reach,
    k1 = bend / reach;
  const out = (r: number) => (r >= reach ? r : k0 * (1 - Math.exp(-r * k1)) * 0.75 + 0.25 * r);
  const spread = (r: number) => (r >= reach ? 1 : r > 0 ? out(r) / r : k0 * k1 * 0.75 + 0.25);
  return { focus, reach, out, times: (r) => Math.sqrt(spread(r)) };
}

/** `lens` round `focus`, reaching `reach`; none for no lens, or a reach of nothing. */
export function lensOf(lens: Lens | undefined, focus: readonly number[] | null, reach: number): Radial | null {
  if (!lens || lens === 'none' || !focus || !(reach > 0)) return null;
  return fisheye(focus, reach);
}

/** Where `p` is seen through `lens`, and how much larger a thing there is drawn. */
export function bent(lens: Radial, p: readonly number[]): { at: number[]; times: number } {
  const d = p.map((v, i) => v - (lens.focus[i] ?? 0)),
    r = Math.hypot(...d);
  if (r === 0 || r >= lens.reach) return { at: [...p], times: lens.times(r) };
  const k = lens.out(r) / r;
  return { at: d.map((v, i) => (lens.focus[i] ?? 0) + v * k), times: lens.times(r) };
}

/** Where a point `q` seen through `lens` was drawn: each lens keeps the order of distances, so it is found by halves. */
export function unbent(lens: Radial, q: readonly number[]): number[] {
  const d = q.map((v, i) => v - (lens.focus[i] ?? 0)),
    seen = Math.hypot(...d);
  if (seen === 0 || seen >= lens.out(lens.reach)) return [...q];
  let [lo, hi] = [0, lens.reach];
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (lens.out(mid) < seen) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2 / seen;
  return d.map((v, i) => (lens.focus[i] ?? 0) + v * k);
}

/** A pair of numbers in an SVG path or a list of points, as Graphviz and our own engine write them: `x,y`. */
const PAIR = /(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+(?:e-?\d+)?)/g;

/** Rounds to two places, as the drawing is written. */
const two = (v: number) => String(Math.round(v * 100) / 100);

/** The middle of the box round each `x,y` of SVG path data or points; none for none. */
export function pointsMiddle(text: string): number[] | null {
  const xs: number[] = [],
    ys: number[] = [];
  for (const [, x, y] of text.matchAll(PAIR)) {
    xs.push(Number(x));
    ys.push(Number(y));
  }
  if (!xs.length) return null;
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** SVG path data or points, each `x,y` moved by `to`. */
export function bentPoints(text: string, to: (x: number, y: number) => readonly number[]): string {
  return text.replace(PAIR, (_, x: string, y: string) => {
    const [bx = 0, by = 0] = to(Number(x), Number(y));
    return `${two(bx)},${two(by)}`;
  });
}

/**
 * `space` seen through `lens`: each thing's middle, each link's points, each name and each arrowhead moved. A thing,
 * its name and an arrowhead are as much larger as the lens enlarges where they are. The box round it all stays, so the
 * camera and the mini-map see the whole drawing as laid out.
 */
export function bentSpace(space: SpaceMarks, lens: Radial | null): SpaceMarks {
  if (!lens) return space;
  const at = (p: readonly number[]) => bent(lens, p).at as Vec3;
  const blocks = space.blocks.map((b) => {
    const {
      at: [x = 0, y = 0, z = 0],
      times: t,
    } = bent(lens, [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2]);
    const [width, depth, tall] = [b.width * t, b.depth * t, b.tall * t];
    const card = b.card && { width: b.card.width * t, height: b.card.height * t };
    return {
      ...b,
      x: x - width / 2,
      y: y - depth / 2,
      floor: z - tall / 2,
      width,
      depth,
      tall,
      ...(card ? { card } : {}),
    };
  });
  const lines = space.lines.map((l) => ({ ...l, points: l.points.map(at) }));
  const labels = space.labels.map((l) => {
    const seen = bent(lens, l.at);
    return { ...l, at: seen.at as Vec3, size: l.size * seen.times };
  });
  const arrows = space.arrows.map((a) => {
    const tip = bent(lens, a.tip);
    return { ...a, tip: tip.at as Vec3, back: at(a.back), size: a.size * tip.times };
  });
  return { ...space, blocks, lines, labels, arrows };
}

/** How far a lens reaches in space, as a share of the drawing's size across. */
const SPACE_REACH = 1 / 3;

/** `space` seen through `lens` round `picked`, the thing picked in it; as laid out, with no lens or nothing picked. */
export function spaceSeen(space: SpaceMarks, lens: Lens | undefined, picked: Block | null): SpaceMarks {
  const across = Math.hypot(space.most[0] - space.least[0], space.most[1] - space.least[1], space.most[2]);
  return bentSpace(space, lensOf(lens, picked && middleOf(picked), across * SPACE_REACH));
}
