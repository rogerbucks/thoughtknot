// Lenses: projections that bend whatever a view has drawn (editor spec §68, projections_all_on). Roger, 25 Oct 2026:
// "I want all views on". A lens lays nothing out. It moves each spot a view drew round a focus. So the same lens works
// on every view type and layout, flat and in space. A fisheye (projection_fisheye) enlarges the things round the focus.
// It shrinks those nearer its rim, so a person sees detail and the whole at once. What lies beyond its reach does not
// move at all, and nor does the focus: it is never disorienting (ethos principle 8). A hyperbolic lens
// (projection_hyperbolic) and a sphere (projection_sphere) reach the whole drawing. They lay it on a disc, a ball in
// space. Its middle is large, and everything else lies towards its edge. The hyperbolic disc is Lamping and Rao's
// (1995). The sphere is a globe seen from the front. Each is round the middle of the view: a drag brings a part there.
//
// A lens is radial: a point at a distance from the focus goes to another distance, the same way. So it bends and
// unbends alike in two dimensions and in three. A tap on a bent drawing is found where it was drawn. Host-free, pure.
import { middleOf } from './space-view.ts';
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';

/**
 * The lenses a view may be seen through, the first being none. Semantic zoom bends nothing: it steps the detail drawn
 * as the person zooms (semantic-zoom.ts).
 */
export const LENSES = ['none', 'fisheye', 'hyperbolic', 'sphere', 'semantic'] as const;
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

/** How strongly a hyperbolic lens bends: the middle is drawn about twice its size, the edge about a seventh. */
export const HYPERBOLIC_BEND = 2;
/** The smallest a thing is drawn near the edge of a disc, so none vanishes. */
const LEAST = 0.25;

/**
 * A lens that lays everything `reach` from `focus` on a disc by `out`, whose slope is `slope`. A thing grows less than
 * the room round it: by the square root of its least stretch, across or along. It is never below a quarter.
 */
function disc(
  focus: readonly number[],
  reach: number,
  out: (r: number) => number,
  slope: (r: number) => number,
): Radial {
  const inside = (r: number) => (r >= reach ? r : out(r));
  const stretch = (r: number) => (r >= reach ? 1 : r > 0 ? Math.min(slope(r), out(r) / r) : slope(0));
  return { focus, reach, out: inside, times: (r) => Math.max(LEAST, Math.sqrt(stretch(r))) };
}

/** A hyperbolic disc round `focus` (Lamping and Rao, 1995): `reach` away, at its edge, the drawing is as drawn. */
export function hyperbolic(focus: readonly number[], reach: number, bend = HYPERBOLIC_BEND): Radial {
  const t = Math.tanh(bend);
  const out = (r: number) => (reach * Math.tanh((bend * r) / reach)) / t,
    slope = (r: number) => (bend * (1 - Math.tanh((bend * r) / reach) ** 2)) / t;
  return disc(focus, reach, out, slope);
}

/** A globe round `focus`, seen from the front: the drawing `reach` across is wrapped on its near half. */
export function sphere(focus: readonly number[], reach: number): Radial {
  const angle = (r: number) => (r / reach) * (Math.PI / 2);
  return disc(
    focus,
    reach,
    (r) => reach * Math.sin(angle(r)),
    (r) => (Math.PI / 2) * Math.cos(angle(r)),
  );
}

/** The lenses that reach the whole drawing, round the middle of the view: none of it lies beyond them. */
export const WHOLE_LENSES: ReadonlySet<Lens> = new Set(['hyperbolic', 'sphere']);

/**
 * `lens` round `focus`, reaching `reach`; none for a lens that bends nothing, or a reach of nothing. A lens that
 * reaches the whole drawing is given how far from its focus the drawing's farthest part lies.
 */
export function lensOf(lens: Lens | undefined, focus: readonly number[] | null, reach: number): Radial | null {
  if (!focus || !(reach > 0)) return null;
  if (lens === 'fisheye') return fisheye(focus, reach);
  if (lens === 'hyperbolic') return hyperbolic(focus, reach);
  if (lens === 'sphere') return sphere(focus, reach);
  return null;
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

/** Whether `c` may be part of a number as SVG writes one: a digit, a point, a sign or an exponent. */
const inNumber = (c: string) => (c >= '0' && c <= '9') || c === '.' || c === '-' || c === 'e';

/**
 * Each pair of numbers in an SVG path or a list of points, as Graphviz and our own engine write them: `x,y`. Read in
 * one pass, with no pattern to backtrack, so text of any length is read in time in proportion to it.
 */
function pairsIn(text: string): { at: number; end: number; x: number; y: number }[] {
  const out: { at: number; end: number; x: number; y: number }[] = [];
  let i = 0;
  while (i < text.length) {
    if (!inNumber(text[i] as string)) {
      i++;
      continue;
    }
    const at = i;
    while (i < text.length && inNumber(text[i] as string)) i++;
    if (text[i] !== ',') continue;
    const mid = i++;
    while (i < text.length && inNumber(text[i] as string)) i++;
    const x = Number(text.slice(at, mid)),
      y = Number(text.slice(mid + 1, i));
    if (i > mid + 1 && Number.isFinite(x) && Number.isFinite(y)) out.push({ at, end: i, x, y });
  }
  return out;
}

/** Rounds to two places, as the drawing is written. */
const two = (v: number) => String(Math.round(v * 100) / 100);

/** The middle of the box round each `x,y` of SVG path data or points; none for none. */
export function pointsMiddle(text: string): number[] | null {
  const pairs = pairsIn(text);
  if (!pairs.length) return null;
  const xs = pairs.map((p) => p.x),
    ys = pairs.map((p) => p.y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** SVG path data or points, each `x,y` moved by `to`. */
export function bentPoints(text: string, to: (x: number, y: number) => readonly number[]): string {
  let out = '',
    from = 0;
  for (const { at, end, x, y } of pairsIn(text)) {
    const [bx = 0, by = 0] = to(x, y);
    out += `${text.slice(from, at)}${two(bx)},${two(by)}`;
    from = end;
  }
  return out + text.slice(from);
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

/** How far a disc reaches past the farthest thing from its focus, as a share of that distance: all sit inside its edge. */
export const DISC_ROOM = 1.15;

/** How far a lens reaches in space, as a share of the drawing's size across. */
const SPACE_REACH = 1 / 3;

/**
 * `space` seen through `lens` round `picked`, the thing picked in it; as laid out, with no lens or nothing picked. A
 * lens that reaches the whole drawing makes a ball of it, round the picked thing, else round the drawing's middle.
 */
export function spaceSeen(space: SpaceMarks, lens: Lens | undefined, picked: Block | null): SpaceMarks {
  const across = Math.hypot(...[0, 1, 2].map((i) => (space.most[i] ?? 0) - (space.least[i] ?? 0)));
  if (lens && WHOLE_LENSES.has(lens)) {
    const middle: Vec3 = [0, 1, 2].map((i) => ((space.most[i] ?? 0) + (space.least[i] ?? 0)) / 2) as Vec3;
    const focus = picked ? middleOf(picked) : middle;
    const far = Math.max(0, ...space.blocks.map((b) => Math.hypot(...middleOf(b).map((v, i) => v - (focus[i] ?? 0)))));
    return bentSpace(space, lensOf(lens, focus, far * DISC_ROOM));
  }
  return bentSpace(space, lensOf(lens, picked && middleOf(picked), across * SPACE_REACH));
}
