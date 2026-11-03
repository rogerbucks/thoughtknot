// Groups placed first, for "big items first, detail on zoom" (editor spec §68, level_layout). Roger, 3 Nov 2026,
// asked for big things first. So subjects are placed, then their areas, then topics, then things, each in its own room.
//
// The levels come from detail-levels.ts. The farthest level's groups are laid out by stress as if each were one thing,
// spaced by the room each needs. Each group's own groups are laid out the same way first, down to the things. So its
// room is measured, and no two rooms meet. The spots are a seed: stress then starts from them and only settles them (stress.ts, warm start). So a
// thing faces its outside links, and each group still sits together.
//
// Only a cold start is seeded. Given last time's spots, the layout starts from those, so nothing moves on its own (nodes
// stay put). A graph with no more than SEED_FROM things gets no seed: its layout is as it was. Host-free and pure.
import { BRANCH, detailLevels } from '../detail-levels.ts';
import type { DetailLevel } from '../detail-levels.ts';
import type { GraphShape } from '../types-shape.ts';
import { stressLayout } from './stress.ts';

/** The most things laid out without a seed: up to two levels, the plain layout is enough. */
export const SEED_FROM = BRANCH * BRANCH;
/** The room between two neighbouring groups, as a share of one link's length. */
const GAP = 0.6;

/** Where each thing starts, in `dims` dimensions and in the units of `unit` (one link's length); null for no seed. */
export function levelSeed(shape: GraphShape, dims: 2 | 3, unit: number): Map<string, number[]> | null {
  if (shape.things.length <= SEED_FROM) return null;
  const levels = detailLevels(shape);
  if (levels.length < 3) return null;
  const named = levels.slice(0, -1);
  // each thing's group at each named level, by the group's key
  const groupAt = named.map((l) => new Map(l.groups.flatMap((g) => g.things.map((t) => [t, g.key] as const))));
  const top = (named[0] as DetailLevel).groups.map((g) => g.key);
  const { spots } = room({ shape, named, groupAt, dims }, 0, top);
  return new Map([...spots].map(([k, s]) => [k, s.map((v) => v * unit)]));
}

/** What placing needs at every level: the shape, its levels and each thing's group. */
interface Placing {
  shape: GraphShape;
  named: readonly DetailLevel[];
  groupAt: readonly ReadonlyMap<string, string>[];
  dims: 2 | 3;
}

/** The radius of one thing's room, in the units of one link. */
const THING = 0.5;

/**
 * The units `keys` of level `at` laid out round 0, each holding its own units. It gives the spots of their things and
 * the radius they fill. The things are past the last named level. Each room is measured once its insides
 * are laid out, so no two rooms meet (in the units of one link).
 */
function room(p: Placing, at: number, keys: readonly string[]): { spots: Map<string, number[]>; radius: number } {
  const things = at >= p.named.length;
  const inner = keys.map((key) => {
    if (things) return { spots: new Map([[key, new Array(p.dims).fill(0) as number[]]]), radius: THING };
    const next = p.named[at + 1];
    const group = p.named[at]?.groups.find((g) => g.key === key);
    const inside = next ? next.groups.filter((c) => c.parent === key).map((c) => c.key) : (group?.things ?? []);
    return room(p, at + 1, inside);
  });
  const centres = spaced(
    keys,
    linksAt(p, at, keys),
    inner.map((i) => i.radius),
    p.dims,
  );
  const spots = new Map<string, number[]>();
  let radius = 0;
  inner.forEach((i, n) => {
    const c = centres[n] as number[];
    radius = Math.max(radius, Math.hypot(...c) + i.radius);
    for (const [k, s] of i.spots)
      spots.set(
        k,
        s.map((v, d) => v + (c[d] ?? 0)),
      );
  });
  return { spots, radius };
}

/** The links between the units `keys` of level `at`, once for each pair. */
function linksAt(p: Placing, at: number, keys: readonly string[]): GraphShape['links'] {
  const things = at >= p.named.length;
  const unitOf = (thing: string) => (things ? thing : p.groupAt[at]?.get(thing));
  const set = new Set(keys);
  const seen = new Set<string>();
  return p.shape.links.flatMap((l) => {
    const a = unitOf(l.from),
      b = unitOf(l.to);
    if (!a || !b || a === b || !set.has(a) || !set.has(b)) return [];
    const pair = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (seen.has(pair)) return [];
    seen.add(pair);
    return [{ from: a, type: '', to: b }];
  });
}

/** The middles of `keys`, laid out by stress as single things, spread until no two rooms of `radii` meet, round 0. */
function spaced(
  keys: readonly string[],
  links: GraphShape['links'],
  radii: readonly number[],
  dims: 2 | 3,
): number[][] {
  if (keys.length === 1) return [new Array(dims).fill(0) as number[]];
  const shape = { things: keys.map((key) => ({ key, text: key, kinds: [] })), links };
  const laid = stressLayout(shape, dims, undefined, { unit: 1 });
  // two units laid on one spot are first set apart a little, so spreading can part them
  const at = keys.map((k, i): number[] => {
    const s = laid.get(k) ?? (new Array(dims).fill(0) as number[]);
    return s.map((v, d) => (d === 0 ? v + i * 1e-3 : v));
  });
  let scale = 1;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const d = Math.hypot(...(at[i] as number[]).map((v, k) => v - ((at[j] as number[])[k] ?? 0)));
      const need = (radii[i] as number) + (radii[j] as number) + GAP;
      if (d > 0) scale = Math.max(scale, need / d);
    }
  const mean = at[0]?.map((_, k) => at.reduce((t, s) => t + (s[k] ?? 0), 0) / at.length) ?? [];
  return at.map((s) => s.map((v, k) => (v - (mean[k] ?? 0)) * scale));
}
