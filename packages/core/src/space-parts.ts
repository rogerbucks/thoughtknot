// Where the parts of a graph go in space (editor spec §53). A lone part, which no link joins to the rest, is pulled in
// beside the largest (space_room). A trunk's joints go between the groups it joins (space_trunks_clear). Merged links
// run from their things to the trunk's first joint, along the trunk to its second, and on to their things
// (fold-source.ts). Laid out like things, the two joints drifted anywhere, so the links bent at odd angles (Roger,
// 27 Oct 2026: "the angles they go at don't make a lot of sense"). So the force layout lays out the things only, each
// merged link joined straight through. Then each joint is set on the line between the things its links join.
// A drawing laid out again, as a group opens or folds, starts from where each thing was (cluster_in_place).
// Host-free and pure.
import type { Spots } from './layouts/layouts.ts';
import type { GraphShape } from './types-shape.ts';
import type { Vec3 } from './space-view.ts';

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

/**
 * `spots` with each lone part of `shape` moved in beside the largest part. A lone part is one no link joins to the
 * largest. It moves to a link's length clear of the largest, on the side it drifted to, when it is further off. Else the
 * rest push it far off. Then the view, fitting it in, draws the rest small and packed (Roger, 25 Oct 2026).
 */
export function partsNear(shape: GraphShape, spots: Spots<3>): Spots<3> {
  const top = new Map<string, string>();
  const root = (k: string): string => {
    let r = k;
    while (top.has(r) && top.get(r) !== r) r = top.get(r) as string;
    top.set(k, r);
    return r;
  };
  for (const t of shape.things) top.set(t.key, t.key);
  for (const l of shape.links) if (top.has(l.from) && top.has(l.to)) top.set(root(l.from), root(l.to));
  const parts = new Map<string, string[]>();
  for (const t of shape.things) {
    if (!spots.has(t.key)) continue;
    const r = root(t.key);
    const here = parts.get(r);
    if (here) here.push(t.key);
    else parts.set(r, [t.key]);
  }
  if (parts.size < 2) return spots;
  const at = (k: string) => spots.get(k) ?? [0, 0, 0];
  const ball = (keys: readonly string[]) => {
    const mid = scale(keys.map(at).reduce(add, [0, 0, 0]), 1 / keys.length);
    return { mid, r: Math.max(...keys.map((k) => Math.hypot(...sub(at(k), mid)))) };
  };
  const [main, ...rest] = [...parts.values()].sort((a, b) => b.length - a.length);
  const whole = ball(main ?? []);
  const out = new Map(spots);
  for (const keys of rest) {
    const part = ball(keys),
      away = sub(part.mid, whole.mid);
    const clear = whole.r + part.r + 1;
    if (Math.hypot(...away) <= clear) continue;
    const by = sub(add(whole.mid, scale(norm(away), clear)), part.mid);
    for (const k of keys) out.set(k, add(at(k), by));
  }
  return out;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
