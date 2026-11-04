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
/** The most things a network has and is still spread as before: a bigger one is placed by its levels (level_default). */
export const LEVELLED_FROM = 200;
/** The room between two neighbouring groups, as a share of one link's length. */
const GAP = 0.6;
/** The most rounds of pushing apart two units whose rooms still meet. */
const PUSHES = 160;
/** How far the units are drawn in toward their middle each time, before being pushed apart again. */
const DRAW_IN = 0.8;

/** One unit laid out at a level: a group, by its key, or a thing, with the room it takes once laid out inside. */
interface Unit {
  key: string;
  room: number;
}

/** The room a thing takes, and the room spared round a group's insides, as radii in the units of one link. */
const [THING_ROOM, GROUP_SPARE] = [0.5, 0.3];

/** Where each thing starts, in `dims` dimensions and in the units of `unit` (one link's length); null for no seed. */
export function levelSeed(shape: GraphShape, dims: 2 | 3, unit: number): Map<string, number[]> | null {
  if (shape.things.length <= SEED_FROM) return null;
  const levels = detailLevels(shape);
  if (levels.length < 3) return null;
  const named = levels.slice(0, -1);
  // each thing's group at each named level, by the group's key
  const groupAt = named.map((l) => new Map(l.groups.flatMap((g) => g.things.map((t) => [t, g.key] as const))));
  const top = (named[0] as DetailLevel).groups.map((g) => g.key);
  const { spots } = lay({ shape, named, groupAt, dims }, 0, top);
  return new Map([...spots].map(([k, s]) => [k, s.map((v) => v * unit)]));
}

/** What placing needs at every level: the shape, its levels, and each thing's group. */
interface Placing {
  shape: GraphShape;
  named: readonly DetailLevel[];
  groupAt: readonly ReadonlyMap<string, string>[];
  dims: 2 | 3;
}

/**
 * The units `keys` at level `at` (things, past the last named level) laid out round the middle. Each group's insides
 * are laid out first, so its room is the room it really takes. Gives back each thing's spot and the room of them all.
 */
function lay(p: Placing, at: number, keys: readonly string[]): { spots: Map<string, number[]>; room: number } {
  const things = at >= p.named.length;
  const inside = new Map<string, Map<string, number[]>>(),
    units: Unit[] = [];
  for (const key of keys) {
    if (things) {
      units.push({ key, room: THING_ROOM });
      continue;
    }
    const next = p.named[at + 1];
    const kids = next
      ? next.groups.filter((c) => c.parent === key).map((c) => c.key)
      : ((p.named[at] as DetailLevel).groups.find((g) => g.key === key)?.things ?? []);
    const laid = lay(p, at + 1, kids);
    inside.set(key, laid.spots);
    units.push({ key, room: laid.room + GROUP_SPARE });
  }
  const unitOf = (thing: string) => (things ? thing : p.groupAt[at]?.get(thing));
  const known = new Set(keys);
  const seen = new Set<string>();
  const links = p.shape.links.flatMap((l) => {
    const a = unitOf(l.from),
      b = unitOf(l.to);
    if (!a || !b || a === b || !known.has(a) || !known.has(b)) return [];
    const pair = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (seen.has(pair)) return [];
    seen.add(pair);
    return [{ from: a, type: '', to: b }];
  });
  const spots = spaced(units, links, p.dims);
  const out = new Map<string, number[]>();
  let room = THING_ROOM;
  for (const u of units) {
    const s = spots.get(u.key) ?? (new Array(p.dims).fill(0) as number[]);
    room = Math.max(room, Math.hypot(...s) + u.room);
    if (things) out.set(u.key, s);
    else
      for (const [t, q] of inside.get(u.key) ?? [])
        out.set(
          t,
          q.map((v, k) => v + (s[k] ?? 0)),
        );
  }
  return { spots: out, room };
}

/** `units` laid out by stress as single things, spread until no two rooms meet, their middle at `centre`. */
function spaced(units: readonly Unit[], links: GraphShape['links'], dims: 2 | 3): Map<string, number[]> {
  if (units.length <= 1) return new Map(units.map((u) => [u.key, new Array(dims).fill(0) as number[]]));
  const shape = { things: units.map((u) => ({ key: u.key, text: u.key, kinds: [] })), links };
  const laid = stressLayout(shape, dims, undefined, { unit: 1 });
  const at = units.map((u): number[] => [...(laid.get(u.key) ?? (new Array(dims).fill(0) as number[]))]),
    room = units.map((u) => u.room);
  // scaled so a typical unit just clears its nearest neighbour, then pushed apart where two rooms still meet. So the
  // units sit close, as the mockup packs them, and no two overlap
  const nearest = units.map((_, i) => {
    let best = Infinity,
      need = 1;
    for (let j = 0; j < units.length; j++) {
      const d =
        i === j ? Infinity : Math.hypot(...(at[i] as number[]).map((v, k) => v - ((at[j] as number[])[k] ?? 0)));
      if (d < best) [best, need] = [d, (room[i] as number) + (room[j] as number) + GAP];
    }
    return best > 0 && best < Infinity ? need / best : 1;
  });
  const scale = [...nearest].sort((a, b) => a - b)[Math.floor(nearest.length / 2)] ?? 1;
  for (const s of at) for (let k = 0; k < s.length; k++) s[k] = (s[k] ?? 0) * scale;
  // then drawn in toward their middle and pushed apart again, a few times, so the rooms pack close as the mockup's do
  for (let round = 0; round < PUSHES; round++) {
    let moved = false;
    if (round % 8 === 0 && round < PUSHES / 2)
      for (const q of at) for (let k = 0; k < q.length; k++) q[k] = (q[k] ?? 0) * DRAW_IN;
    for (let i = 0; i < units.length; i++)
      for (let j = i + 1; j < units.length; j++) {
        const [a, b] = [at[i] as number[], at[j] as number[]];
        const gap = a.map((v, k) => (b[k] ?? 0) - v),
          d = Math.hypot(...gap) || 1e-6;
        const short = (room[i] as number) + (room[j] as number) + GAP - d;
        if (short <= 0) continue;
        moved = true;
        for (let k = 0; k < a.length; k++) {
          const push = (((gap[k] ?? 0) / d) * short) / 2 + (d < 1e-3 ? (k === 0 ? short / 2 : 0) : 0);
          a[k] = (a[k] ?? 0) - push;
          b[k] = (b[k] ?? 0) + push;
        }
      }
    if (!moved && round >= PUSHES / 2) break;
  }
  const mean = at[0]?.map((_, k) => at.reduce((t, q) => t + (q[k] ?? 0), 0) / at.length) ?? [];
  return new Map(units.map((u, i) => [u.key, (at[i] as number[]).map((v, k) => v - (mean[k] ?? 0))]));
}
