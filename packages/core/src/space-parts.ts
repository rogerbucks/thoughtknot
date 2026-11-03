// Where the parts of a graph go in space (editor spec §53). A lone part, which no link joins to the rest, is pulled in
// beside the largest (space_room). A trunk's joints go between the groups it joins (space_trunks_clear). Merged links
// run from their things to the trunk's first joint, along the trunk to its second, and on to their things
// (fold-source.ts). Laid out like things, the two joints drifted anywhere, so the links bent at odd angles (Roger,
// 27 Oct 2026: "the angles they go at don't make a lot of sense"). So the force layout lays out the things only, each
// merged link joined straight through. Then each joint is set on the line between the things its links join.
// A drawing laid out again, as a group opens or folds, starts from where each thing was (cluster_in_place).
// Host-free and pure.
import type { Spots } from './layouts/layouts.ts';
import { packPlaced, partsOf, trayOf } from './layouts/parts.ts';
import type { Placed } from './layouts/parts.ts';
import type { GraphShape } from './types-shape.ts';
import type { DrawMark } from './drawing-marks.ts';

/** How many pixels of the space one unit of the layout is: about one link's length. */
export const SPREAD_UNIT = 120;

/** A trunk's joint, as the layout source names it (`trunk: 1 in`), or as the drawing on screen does (`trunk_1_in`). */
const JOINT = /^(?:trunk: (\d+) (in|out)|trunk_(\d+)_(in|out))$/;

/** Whether `key` is a trunk's joint. */
export const isJoint = (key: string | undefined): boolean => JOINT.test(key ?? '');

/** How far each joint sits from its own things toward the things at the trunk's other end: the trunk is the middle. */
const JOINT_AT = 0.3;

/** The other joint of `key`'s trunk: its out for its in, its in for its out. */
function otherEnd(key: string): string {
  const m = JOINT.exec(key);
  if (!m) return key;
  const flip = (end: string | undefined) => (end === 'in' ? 'out' : 'in');
  return m[1] !== undefined ? `trunk: ${m[1]} ${flip(m[2])}` : `trunk_${m[3]}_${flip(m[4])}`;
}

/** The things linked to each joint of `shape`, either way round, in the order of their links. */
function sidesOf(shape: GraphShape): Map<string, string[]> {
  const sides = new Map<string, string[]>();
  for (const l of shape.links)
    for (const [joint, thing] of [
      [l.to, l.from],
      [l.from, l.to],
    ] as const)
      if (isJoint(joint) && !isJoint(thing)) sides.set(joint, [...(sides.get(joint) ?? []), thing]);
  return sides;
}

/**
 * `shape` with no joints. Each link merged into a trunk runs straight from its first thing to its last instead. So the
 * force layout still draws the two groups together. The trunk itself, from joint to joint, is left out.
 */
export function withoutJoints(shape: GraphShape): GraphShape {
  if (!shape.things.some((t) => isJoint(t.key))) return shape;
  const sides = sidesOf(shape);
  const links = shape.links.filter((l) => !isJoint(l.from) && !isJoint(l.to));
  for (const [joint, these] of sides) {
    const those = sides.get(otherEnd(joint)) ?? [];
    // each first joint's link meets the link of the same place at the second: fold-source.ts writes them in pairs
    if (JOINT.exec(joint)?.slice(2).includes('in'))
      these.forEach((from, i) => {
        const to = those[i];
        if (to !== undefined) links.push({ from, type: '', to });
      });
  }
  return { ...shape, things: shape.things.filter((t) => !isJoint(t.key)), links };
}

/** The middle of the spots of `keys` that have one; none when none has. */
function middleOf(keys: readonly string[], spots: Spots<3>): [number, number, number] | undefined {
  const at = keys.flatMap((k) => {
    const p = spots.get(k);
    return p ? [p] : [];
  });
  if (!at.length) return undefined;
  const sum = at.reduce((t, p) => [t[0] + p[0], t[1] + p[1], t[2] + p[2]], [0, 0, 0]);
  return [sum[0] / at.length, sum[1] / at.length, sum[2] / at.length];
}

/**
 * `spots` with each joint of `shape` set between the things its trunk's links come from and go to, nearer its own.
 * A joint with no such things is left where it was.
 */
export function jointsBetween(shape: GraphShape, spots: Spots<3>): Spots<3> {
  const sides = sidesOf(shape),
    out = new Map(spots);
  for (const [joint, these] of sides) {
    const here = middleOf(these, spots),
      there = middleOf(sides.get(otherEnd(joint)) ?? [], spots);
    if (!here || !there) continue;
    out.set(
      joint,
      [0, 1, 2].map((i) => (here[i] ?? 0) + ((there[i] ?? 0) - (here[i] ?? 0)) * JOINT_AT) as [number, number, number],
    );
  }
  return out;
}

/** How far apart the things of a group just opened start, round where its box was, in the layout's units. */
const OPENED_APART = 0.15;

/**
 * The spots to lay a drawing out again from, so a group opens or folds where it was (cluster_in_place). Each thing keeps
 * its `last` spot. A thing that was in a folded box, by `held` (each box's key and its things), starts round the box's
 * last spot. A box that has just folded starts at the middle of its things' last spots.
 */
export function spotsKept(last: Spots<3>, held: Iterable<readonly [string, readonly string[]]>): Spots<3> {
  const out = new Map(last);
  for (const [box, keys] of held) {
    const at = last.get(box),
      mid = middleOf(keys, last);
    if (at)
      keys.forEach((k, i) => {
        // round the box on a small spiral, so no two start in one place
        const r = OPENED_APART * Math.cbrt(i + 1);
        if (!out.has(k)) out.set(k, [at[0] + r * Math.cos(i * 2.4), at[1] + r * Math.sin(i * 2.4), at[2]]);
      });
    else if (mid) out.set(box, mid);
  }
  return out;
}

/** The room each thing takes in space, in the layout's units, round its spot: about half a link's length. */
const PART_ROOM = 0.5;
/** The room between two parts packed side by side in space, in the layout's units: a link's length. */
const PART_GAP = 1;

/**
 * `spots` with the parts of `shape` packed to a screen's shape, as the flat engine packs them (parts.ts). A part is
 * what links join. The largest goes first, then the rest across and down, beside it. Things with no link sit in a tray,
 * by name. Each keeps its depth. Else the rest push lone parts far off, and the view draws everything small (Roger,
 * 25 and 28 Oct 2026).
 */
export function partsNear(shape: GraphShape, spots: Spots<3>): Spots<3> {
  const keys = shape.things.map((t) => t.key).filter((k) => spots.has(k));
  const parts = partsOf(keys, shape.links);
  if (parts.length < 2) return spots;
  const at = (k: string) => spots.get(k) ?? [0, 0, 0];
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const loose = parts.filter((p) => p.length === 1).flat();
  // across and down the page, as the packing reads it: up in space is up the page
  const pieces: Placed[] = parts
    .filter((p) => p.length > 1)
    .map((p) => ({ spots: new Map(p.map((k) => [k, [at(k)[0], -at(k)[1]]])), via: new Map(), boxes: [] }));
  const room = new Map(keys.map((k) => [k, [PART_ROOM * 2, PART_ROOM * 2] as const]));
  if (loose.length)
    pieces.push({ spots: trayOf(loose, room, (k) => text.get(k) ?? k, PART_ROOM).spots, via: new Map(), boxes: [] });
  const packed = packPlaced(pieces, room, PART_GAP);
  // the largest part stays where it was laid out; the rest move round it
  const [k0] = parts[0] as string[];
  const [px, py] = packed.spots.get(k0 as string) ?? [0, 0];
  const [x0, y0] = at(k0 as string);
  const out = new Map(spots);
  for (const [k, [x, y]] of packed.spots) out.set(k, [x - px + x0, -(y - py) + y0, at(k)[2]]);
  return out;
}

/** Each thing's middle on the page, by its key: where its first box is drawn. */
export function middlesOf(marks: readonly DrawMark[]): Map<string, [number, number]> {
  const at = new Map<string, [number, number]>();
  for (const m of marks)
    if (m.kind === 'box' && m.of !== undefined && !at.has(m.of)) at.set(m.of, [m.x + m.width / 2, m.y + m.height / 2]);
  return at;
}

/**
 * The spots of things kept where the drawing put them, `at`, in the layout's units: a link about one long. Each starts
 * a little off the page, so the force layout can lift what lies close apart in depth. Gives back the pixels per unit.
 */
export function drawnSpots(shape: GraphShape, at: Map<string, [number, number]>): { seeds: Spots<3>; unit: number } {
  const lengths = shape.links
    .map((l) => [at.get(l.from), at.get(l.to)])
    .flatMap(([a, b]) => (a && b && (a[0] !== b[0] || a[1] !== b[1]) ? [Math.hypot(a[0] - b[0], a[1] - b[1])] : []))
    .sort((p, q) => p - q);
  const unit = lengths[Math.floor(lengths.length / 2)] ?? SPREAD_UNIT;
  const seeds = new Map<string, [number, number, number]>();
  shape.things.forEach((t, i) => {
    const [x, y] = at.get(t.key) ?? [0, 0];
    // down the page is back along the space, as spaceOf lifts it: so the drawing's top is at the top of the view
    seeds.set(t.key, [x / unit, -y / unit, ((i % 3) - 1) * 0.1]);
  });
  return { seeds, unit };
}

/**
 * Where the page drew each thing, as seeds for a first layout in space; none where the page gave no real places. So a
 * network opened in space is not shuffled: it spreads out in depth from where it was (things_stay_put).
 */
export function pageSeeds(shape: GraphShape, marks: readonly DrawMark[]): Spots<3> | undefined {
  const at = middlesOf(marks);
  const distinct = new Set([...at.values()].map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
  // a page that drew things in one line gives no shape to keep: it is laid out afresh
  const flat = [0, 1].some((d) => new Set([...at.values()].map((p) => Math.round(p[d] ?? 0))).size < 2);
  return distinct.size > at.size / 2 && !flat ? drawnSpots(shape, at).seeds : undefined;
}
