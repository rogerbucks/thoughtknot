// A drawing laid out again in 2.5D or 3D glides, as it does flat (editor spec §68, layout_glide). A layout made
// afresh in space is lined up with the last one first. It is turned round the upright, flipped and shifted to fit
// the old spots best (layout-glide.ts), so it does not spin or jump. Up stays up, so floors and planes stay level.
// Then each thing glides from its old spot to its new one, its name, links and arrowheads with it. Pure: the view in
// space paints each step (space-view-panel.ts).
import { GLIDE_MOST, MOVED_PX, easeGlide, lineUp, linedUp } from './layout-glide.ts';
import type { LineUp, Pt } from './layout-glide.ts';
import { boundsOf } from './space-view.ts';
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';

/** The middle of each thing's block on its floor, and its floor, by the thing's key. */
export function spotsOf(space: SpaceMarks): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const b of space.blocks) if (b.of !== undefined) out.set(b.of, [b.x + b.width / 2, b.y + b.depth / 2, b.floor]);
  return out;
}

/** The flat part of each spot: across and along the floor. */
const flat = (at: ReadonlyMap<string, Vec3>): Map<string, Pt> => new Map([...at].map(([k, [x, y]]) => [k, [x, y]]));

/** `space` turned, flipped and shifted on the floor as `by` says; heights are kept. */
export function turnedSpace(space: SpaceMarks, by: LineUp): SpaceMarks {
  const at = ([x, y, z]: Vec3): Vec3 => {
    const [nx, ny] = linedUp([x, y], by);
    return [nx, ny, z];
  };
  const blocks = space.blocks.map((b): Block => {
    const [x, y] = linedUp([b.x + b.width / 2, b.y + b.depth / 2], by);
    // a block turned a quarter round is as wide as it was deep; a card or a ball is the same any way round
    const across = Math.abs(Math.sin(by.turn)) > Math.SQRT1_2 && !b.card;
    const [width, depth] = across ? [b.depth, b.width] : [b.width, b.depth];
    return { ...b, x: x - width / 2, y: y - depth / 2, width, depth };
  });
  const lines = space.lines.map((l) => ({ ...l, points: l.points.map(at) }));
  const labels = space.labels.map((l) => ({ ...l, at: at(l.at) }));
  const arrows = space.arrows.map((a) => ({ ...a, tip: at(a.tip), back: at(a.back) }));
  return { ...space, blocks, lines, labels, arrows, ...boundsOf(blocks, lines, labels) };
}

/**
 * How `now`, a layout made afresh in space, lines up with `was`, the one shown before. It is turned and shifted on
 * the floor to fit the things in both best. None where nothing is in both or nothing would change.
 */
export function lineUpSpace(was: SpaceMarks, now: SpaceMarks): LineUp | null {
  const by = lineUp(flat(spotsOf(was)), flat(spotsOf(now)));
  const still = !by.flip && !by.turn && by.from[0] === by.to[0] && by.from[1] === by.to[1];
  return still ? null : by;
}

/** Each spot of `spots` lined up as `by` says, so the next layout starts from the spots as shown. */
export function turnedSpots(spots: ReadonlyMap<string, Vec3>, by: LineUp): Map<string, Vec3> {
  return new Map(
    [...spots].map(([k, [x0, y0, z]]) => {
      const [x, y] = linedUp([x0, y0], by);
      return [k, [x, y, z]];
    }),
  );
}

/**
 * `now`, laid out afresh in space, and its `spots`, lined up with `was`, the drawing shown before. Unchanged where
 * nothing is in both or nothing would change.
 */
export function linedUpLayout(
  was: SpaceMarks,
  now: SpaceMarks,
  spots: ReadonlyMap<string, Vec3> | undefined,
): [SpaceMarks, ReadonlyMap<string, Vec3> | undefined] {
  const by = lineUpSpace(was, now);
  return by ? [turnedSpace(now, by), spots && turnedSpots(spots, by)] : [now, spots];
}

/** Each thing's offset from where it ends to where it was, by its key: only those that moved. */
function offsetsOf(was: ReadonlyMap<string, Vec3>, now: ReadonlyMap<string, Vec3>): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const [k, [x, y, z]] of now) {
    const from = was.get(k);
    if (!from) continue;
    const d: Vec3 = [from[0] - x, from[1] - y, from[2] - z];
    if (Math.hypot(...d) >= MOVED_PX) out.set(k, d);
  }
  return out;
}

const NONE: Vec3 = [0, 0, 0];
const plus = (p: Vec3, d: Vec3, k: number): Vec3 => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
const mix = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

/**
 * The glide from `was` to `now`: the drawing a fraction `t` of the way, eased. At 0 each thing is where it was; from
 * 1 it is `now` itself. A link's ends go with the things it joins, and its arrowhead with the thing it points to.
 * None where nothing moved, or where too many things move to follow.
 */
export function spaceGlide(was: SpaceMarks, now: SpaceMarks): ((t: number) => SpaceMarks) | null {
  const offsets = offsetsOf(spotsOf(was), spotsOf(now));
  if (!offsets.size || now.blocks.length > GLIDE_MOST) return null;
  const of = (k?: string) => (k === undefined ? NONE : (offsets.get(k) ?? NONE));
  const byLine = new Map(now.lines.map((l) => [l.id, l]));
  return (t) => {
    if (t >= 1) return now;
    const left = 1 - easeGlide(t);
    const blocks = now.blocks.map((b) => {
      const d = of(b.of);
      return d === NONE ? b : { ...b, x: b.x + d[0] * left, y: b.y + d[1] * left, floor: b.floor + d[2] * left };
    });
    const lines = now.lines.map((l) => {
      const a = of(l.from),
        b = of(l.to),
        n = l.points.length - 1;
      if (a === NONE && b === NONE) return l;
      return { ...l, points: l.points.map((p, i) => plus(p, mix(a, b, n ? i / n : 0), left)) };
    });
    const labels = now.labels.map((l) => {
      const line = l.link === undefined ? undefined : byLine.get(l.link);
      const d = line ? mix(of(line.from), of(line.to), 0.5) : of(l.of);
      return d === NONE ? l : { ...l, at: plus(l.at, d, left) };
    });
    const arrows = now.arrows.map((a) => {
      const d = of(byLine.get(a.id.replace(/\narrow$/, ''))?.to);
      return d === NONE ? a : { ...a, tip: plus(a.tip, d, left), back: plus(a.back, d, left) };
    });
    return { ...now, blocks, lines, labels, arrows };
  };
}
