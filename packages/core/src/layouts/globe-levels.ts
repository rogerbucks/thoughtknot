// A big graph on the globe, placed by its levels (editor spec §68, globe_levels). Roger, 4 Nov 2026: bring the globe
// mockup's design to the app's globe. So each subject has its own region of the globe. Each area has its own patch
// inside that, and each topic its own patch inside the area. Its things sit in the topic's patch.
//
// Each region's share of the surface is its share of the things. The biggest subject takes a cap round the pole,
// which faces the camera. The rest of the globe is halved again and again, across its longer side, so each region is
// a patch near square. Inside a region its areas are laid the same way, and its things in rows.
// Host-free and pure: the same graph gives the same globe every time.
import type { DetailLevel } from '../detail-levels.ts';
import type { GlobeVec } from './globe.ts';

const cross = (a: GlobeVec, b: GlobeVec): GlobeVec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: GlobeVec): GlobeVec => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The way `turn` radians from `c` toward the way `angle` round it, over the sphere's surface. */
function along(c: GlobeVec, turn: number, angle: number): GlobeVec {
  const ref: GlobeVec = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = unit(cross(c, ref)),
    e2 = cross(c, e1);
  const [cs, sn] = [Math.cos(turn), Math.sin(turn)];
  const t = (i: 0 | 1 | 2) => cs * c[i] + sn * (Math.cos(angle) * e1[i] + Math.sin(angle) * e2[i]);
  return unit([t(0), t(1), t(2)]);
}

/** A part of the globe: its things, and its parts one level in, if it has any. */
interface Part {
  things: string[];
  parts: Part[];
}

/** The tree of `levels`: each subject, its areas, their topics, down to the things. */
function treeOf(levels: readonly DetailLevel[]): Part[] {
  const grouped = levels.filter((l) => l.groups.length);
  const partsAt = (depth: number, parent?: string): Part[] =>
    (grouped[depth]?.groups ?? [])
      .filter((g) => depth === 0 || g.parent === parent)
      .map((g) => ({ things: g.things, parts: depth + 1 < grouped.length ? partsAt(depth + 1, g.key) : [] }));
  return partsAt(0);
}

/**
 * A patch of the globe, round its pole. It runs from `f0` to `f1` of the surface out from the pole, by area. It runs
 * from angle `a0` to `a1` round it. Measured by area, a patch's share of the things is its share of the surface.
 */
interface Patch {
  f0: number;
  f1: number;
  a0: number;
  a1: number;
}

/** The angle from the pole out to `f` of the surface, by area. */
const angleAt = (f: number) => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * f)));
/** How long a patch runs out from the pole, and round it, over the sphere's surface. */
const sides = (p: Patch): [number, number] => [
  angleAt(p.f1) - angleAt(p.f0),
  (p.a1 - p.a0) * Math.sin((angleAt(p.f0) + angleAt(p.f1)) / 2),
];
const sizeOf = (ps: readonly Part[]) => ps.reduce((n, p) => n + p.things.length, 0);

/** `patch` split in two, across its longer side, `share` of it in the first. */
function cut(patch: Patch, share: number): [Patch, Patch] {
  const [out, round] = sides(patch);
  if (round >= out) {
    const a = patch.a0 + (patch.a1 - patch.a0) * share;
    return [
      { ...patch, a1: a },
      { ...patch, a0: a },
    ];
  }
  const f = patch.f0 + (patch.f1 - patch.f0) * share;
  return [
    { ...patch, f1: f },
    { ...patch, f0: f },
  ];
}

/** `parts` laid in `patch`, each in its share of it: halved again and again, so each piece stays near square. */
function place(parts: readonly Part[], patch: Patch, pole: GlobeVec, out: Map<string, GlobeVec>): void {
  if (parts.length === 1) {
    const [p] = parts as [Part];
    if (p.parts.length) return place(p.parts, patch, pole, out);
    return spread(p.things, patch, pole, out);
  }
  const sorted = [...parts].sort((a, b) => b.things.length - a.things.length);
  // two halves of about the same size, the biggest parts first
  const all = sizeOf(sorted);
  let split = 1;
  while (split < sorted.length - 1 && sizeOf(sorted.slice(0, split + 1)) <= all / 2) split++;
  const [first, rest] = [sorted.slice(0, split), sorted.slice(split)];
  const [here, there] = cut(patch, sizeOf(first) / (all || 1));
  place(first, here, pole, out);
  place(rest, there, pole, out);
}

/** The share of a patch kept clear at each edge, so a gap runs between regions. */
const EDGE = 0.15;

/** `things` in rows across `patch`, as near square as it allows, clear of its edges. */
function spread(things: readonly string[], patch: Patch, pole: GlobeVec, out: Map<string, GlobeVec>): void {
  const n = things.length,
    [out_, round] = sides(patch);
  const rows = Math.max(1, Math.round(Math.sqrt((n * out_) / Math.max(round, 1e-9)))),
    cols = Math.ceil(n / rows);
  things.forEach((k, i) => {
    const [r, c] = [Math.floor(i / cols), i % cols];
    const at = (i: number, of: number) => EDGE + (1 - 2 * EDGE) * (of > 1 ? i / (of - 1) : 0.5);
    const f = patch.f0 + at(r, rows) * (patch.f1 - patch.f0),
      a = patch.a0 + at(c, cols) * (patch.a1 - patch.a0);
    out.set(k, along(pole, angleAt(f), a));
  });
}

/** Each thing's way from the middle of the globe, by `levels`, the biggest subject toward `facing`; null for none. */
export function levelWays(levels: readonly DetailLevel[], facing: GlobeVec): Map<string, GlobeVec> | null {
  const tree = treeOf(levels);
  if (tree.length < 2) return null;
  const out = new Map<string, GlobeVec>(),
    pole = unit(facing);
  // the biggest subject in a cap round the pole, facing the camera; the rest share the globe beyond it
  const [biggest, ...rest] = [...tree].sort((a, b) => b.things.length - a.things.length) as [Part, ...Part[]];
  const share = biggest.things.length / (sizeOf(tree) || 1);
  place([biggest], { f0: 0, f1: share, a0: 0, a1: 2 * Math.PI }, pole, out);
  place(rest, { f0: share, f1: 1, a0: 0, a1: 2 * Math.PI }, pole, out);
  return out;
}
