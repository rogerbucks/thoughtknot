// Groups placed first, for "big items first, detail on zoom" (editor spec §68, level_layout). Roger, 3 Nov 2026,
// asked for big things first. So subjects are placed, then their areas, then topics, then things, each in its own room.
//
// The levels come from detail-levels.ts. The farthest level's groups are laid out by stress as if each were one thing,
// spaced by how much room each needs. Then each group's own groups are laid out the same way, inside its room, down to
// the things. The spots are a seed: stress then starts from them and only settles them (stress.ts, warm start). So a
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

/** One unit laid out at a level: a group, by its key, or a thing. Its room grows with how many things it holds. */
interface Unit {
  key: string;
  count: number;
}

/** Where each thing starts, in `dims` dimensions and in the units of `unit` (one link's length); null for no seed. */
export function levelSeed(shape: GraphShape, dims: 2 | 3, unit: number): Map<string, number[]> | null {
  if (shape.things.length <= SEED_FROM) return null;
  const levels = detailLevels(shape);
  if (levels.length < 3) return null;
  const named = levels.slice(0, -1);
  // each thing's group at each named level, by the group's key
  const groupAt = named.map((l) => new Map(l.groups.flatMap((g) => g.things.map((t) => [t, g.key] as const))));
  const out = new Map<string, number[]>();
  const top = (named[0] as DetailLevel).groups.map((g) => ({ key: g.key, count: g.things.length }));
  place({ shape, named, groupAt, dims, unit, out }, 0, top, new Array(dims).fill(0) as number[]);
  return out;
}

/** What placing needs at every level: the shape, its levels, each thing's group, and the spots made so far. */
interface Placing {
  shape: GraphShape;
  named: readonly DetailLevel[];
  groupAt: readonly ReadonlyMap<string, string>[];
  dims: 2 | 3;
  unit: number;
  out: Map<string, number[]>;
}

/** `units` at level `at` (the things past the last named level) laid out round `centre`, then each one's own units. */
function place(p: Placing, at: number, units: readonly Unit[], centre: readonly number[]): void {
  const things = at >= p.named.length;
  const unitOf = (thing: string) => (things ? thing : p.groupAt[at]?.get(thing));
  const keys = new Set(units.map((u) => u.key));
  const seen = new Set<string>();
  const links = p.shape.links.flatMap((l) => {
    const a = unitOf(l.from),
      b = unitOf(l.to);
    if (!a || !b || a === b || !keys.has(a) || !keys.has(b)) return [];
    const pair = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (seen.has(pair)) return [];
    seen.add(pair);
    return [{ from: a, type: '', to: b }];
  });
  const spots = spaced(units, links, p, centre);
  if (things) {
    for (const [k, s] of spots) p.out.set(k, s);
    return;
  }
  const level = p.named[at] as DetailLevel,
    next = p.named[at + 1];
  for (const g of level.groups) {
    const s = spots.get(g.key);
    if (!s) continue;
    const inner: Unit[] = next
      ? next.groups.filter((c) => c.parent === g.key).map((c) => ({ key: c.key, count: c.things.length }))
      : g.things.map((t) => ({ key: t, count: 1 }));
    place(p, at + 1, inner, s);
  }
}

/** The room a unit of `count` things needs, as a radius in the units of one link. */
const roomOf = (count: number): number => 0.5 + 0.6 * Math.sqrt(count - 1);

/** `units` laid out by stress as single things, spread until no two rooms meet, their middle at `centre`. */
function spaced(
  units: readonly Unit[],
  links: GraphShape['links'],
  p: Placing,
  centre: readonly number[],
): Map<string, number[]> {
  if (units.length === 1) return new Map([[(units[0] as Unit).key, [...centre]]]);
  const shape = { things: units.map((u) => ({ key: u.key, text: u.key, kinds: [] })), links };
  const laid = stressLayout(shape, p.dims, undefined, { unit: 1 });
  const at = units.map((u): number[] => laid.get(u.key) ?? (new Array(p.dims).fill(0) as number[])),
    room = units.map((u) => roomOf(u.count));
  // spread so the nearest two rooms just clear each other, with a gap
  let scale = 1;
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) {
      const d = Math.hypot(...(at[i] as number[]).map((v, k) => v - ((at[j] as number[])[k] ?? 0)));
      const need = (room[i] as number) + (room[j] as number) + GAP;
      if (d > 0) scale = Math.max(scale, need / d);
    }
  const mean = centre.map((_, k) => at.reduce((t, s) => t + (s[k] ?? 0), 0) / at.length);
  return new Map(
    units.map((u, i) => [
      u.key,
      centre.map((c, k) => c + (((at[i] as number[])[k] ?? 0) - (mean[k] ?? 0)) * scale * p.unit),
    ]),
  );
}
