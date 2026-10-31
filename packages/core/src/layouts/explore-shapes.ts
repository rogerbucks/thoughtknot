// The six shapes an exploration is drawn in (editor spec §71, explore_shapes). Roger, 31 Oct 2026: "Can I have all of
// the views? They'd be great in different circumstances."
//
// Each shape places what an exploration shows, read as a tree from its centre (explore-map.ts). Each works in 2D,
// 2.5D and 3D. In 2.5D each step out from the centre sits one plane further back.
//
// Given the spots from last time, a thing shown already keeps its spot exactly (explore_stays_put). A new thing takes
// its fresh spot's offset from its parent, so it lands beside its parent and nothing on screen moves. Switching shape
// lays out afresh, and the view glides there. Host-free and pure: the same tree gives the same spots every time.
import type { ExploreLink } from '../explore-map.ts';
import type { GraphShape } from '../types-shape.ts';
import { forceLayout } from '../view-types/force-view.ts';
import { forceLayout3d } from './force-3d.ts';
import type { Size } from './layered.ts';
import { tidyTree } from './tidy-tree.ts';

/** The shapes, in the order the shape dial offers them. */
export const EXPLORE_SHAPES = ['balanced', 'one-sided', 'top-down', 'rings', 'disc', 'free'] as const;

/** One of the shapes. */
export type ExploreShape = (typeof EXPLORE_SHAPES)[number];

/** The space a shape is drawn in. */
export type ExploreSpace = '2d' | '2.5d' | '3d';

/** A spot: across and down, and in 2.5D and 3D a third, toward the viewer. */
export type ExploreSpot = [number, number] | [number, number, number];

/** What a shape needs of an exploration: its centre and each thing's children. ExploreMap is one. */
export interface ExploreTree {
  readonly centre: string;
  childrenOf(key: string): string[];
}

/** What else a shape may take: box sizes, last time's spots, and the cross-links the free shape pulls along. */
export interface ExploreShapeOptions {
  sizes?: ReadonlyMap<string, Size>;
  previous?: ReadonlyMap<string, ExploreSpot>;
  crossLinks?: readonly ExploreLink[];
}

/** In CSS pixels: the step between rings, between planes in 2.5D, and along a branch in 3D. */
const RING = 170;
const PLANE = 140;
const REACH = 190;
/** How far out the disc and the sphere reach, and how fast the disc's rings close in. */
const DISC = 520;
const DISC_FALL = 0.55;
/** The widest a branch's cone opens in 3D, in radians. */
const CONE = 1.0;

/** Each thing the exploration `tree` shows, placed in `shape` in `space`. */
export function exploreSpots(
  tree: ExploreTree,
  shape: ExploreShape,
  space: ExploreSpace,
  options: ExploreShapeOptions = {},
): Map<string, ExploreSpot> {
  const t = treeOf(tree);
  let fresh: Map<string, ExploreSpot>;
  if (space === '3d') fresh = spots3d(t, shape, options);
  else {
    fresh = new Map();
    for (const [k, [x, y]] of spots2d(t, shape, options))
      fresh.set(k, space === '2d' ? [x, y] : [x, y, -PLANE * (t.depth.get(k) ?? 0)]);
  }
  return options.previous ? keptPut(t, fresh, options.previous) : fresh;
}

/** An exploration's tree read once: every key from the centre out, each one's children and depth. */
interface Tree {
  centre: string;
  keys: string[];
  children: Map<string, string[]>;
  depth: Map<string, number>;
  leaves: Map<string, number>;
}

/** `tree` read once, from the centre out. */
function treeOf(tree: ExploreTree): Tree {
  const keys = [tree.centre],
    children = new Map<string, string[]>(),
    depth = new Map([[tree.centre, 0]]);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] as string;
    const kids = tree.childrenOf(k).filter((c) => !depth.has(c));
    children.set(k, kids);
    for (const c of kids) {
      depth.set(c, (depth.get(k) as number) + 1);
      keys.push(c);
    }
  }
  // each subtree's leaves, from the leaves up: a branch's share of a ring follows them
  const leaves = new Map<string, number>();
  for (const k of [...keys].reverse()) {
    const kids = children.get(k) as string[];
    leaves.set(k, kids.length ? kids.reduce((n, c) => n + (leaves.get(c) as number), 0) : 1);
  }
  return { centre: tree.centre, keys, children, depth, leaves };
}

/** The flat spots of `shape`, the centre at the middle. */
function spots2d(t: Tree, shape: ExploreShape, options: ExploreShapeOptions): Map<string, [number, number]> {
  if (shape === 'one-sided') return tidy(t, t.children.get(t.centre) as string[], 'LR', options.sizes);
  if (shape === 'top-down') return tidy(t, t.children.get(t.centre) as string[], 'TB', options.sizes);
  if (shape === 'rings') return radial(t, (d) => d * RING);
  if (shape === 'disc') return radial(t, (d) => DISC * Math.tanh(d * DISC_FALL));
  if (shape === 'free') {
    const previous = new Map<string, [number, number]>();
    for (const [k, s] of options.previous ?? []) previous.set(k, [s[0] / REACH, s[1] / REACH]);
    return centred(t, scaled(forceLayout(shapeOf(t, options.crossLinks), previous)));
  }
  // balanced: the centre's branches split into two sides with about as many leaves each, the left side mirrored
  const right: string[] = [],
    left: string[] = [];
  let [r, l] = [0, 0];
  for (const c of t.children.get(t.centre) as string[]) {
    const n = t.leaves.get(c) as number;
    if (r <= l) {
      right.push(c);
      r += n;
    } else {
      left.push(c);
      l += n;
    }
  }
  const out = tidy(t, right, 'LR', options.sizes);
  for (const [k, [x, y]] of tidy(t, left, 'LR', options.sizes)) if (k !== t.centre) out.set(k, [-x, y]);
  return out;
}

/** The tidy tree of the centre and its branches `kids`, in rows running `rankdir`, the centre at the middle. */
function tidy(
  t: Tree,
  kids: readonly string[],
  rankdir: 'LR' | 'TB',
  sizes?: ReadonlyMap<string, Size>,
): Map<string, [number, number]> {
  const things = [t.centre],
    links: GraphShape['links'] = [];
  const walk = (k: string, child: string) => {
    things.push(child);
    links.push({ from: k, type: 'step', to: child });
    for (const c of t.children.get(child) as string[]) walk(child, c);
  };
  for (const c of kids) walk(t.centre, c);
  const shape = { things: things.map((key) => ({ key, text: key, kinds: [] })), links };
  return centred(t, tidyTree(shape, sizes, rankdir)?.spots ?? new Map([[t.centre, [0, 0]]]));
}

/** The rings: each step out one ring further at `radius(depth)`, each branch an arc as wide as its share of leaves. */
function radial(t: Tree, radius: (depth: number) => number): Map<string, [number, number]> {
  return new Map([...arcs(t)].map(([k, a]) => [k, polar(radius(t.depth.get(k) as number), a)]));
}

/** Each thing's angle round the centre, the middle of the arc its branch takes. The first branch points up. */
function arcs(t: Tree): Map<string, number> {
  const angle = new Map<string, number>([[t.centre, 0]]);
  const share = (k: string, from: number, width: number) => {
    let at = from;
    for (const c of t.children.get(k) as string[]) {
      const w = (width * (t.leaves.get(c) as number)) / (t.leaves.get(k) as number);
      angle.set(c, at + w / 2);
      share(c, at, w);
      at += w;
    }
  };
  share(t.centre, -Math.PI / 2, 2 * Math.PI);
  return angle;
}

/** A spot `r` out at angle `a`, across and down. */
const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];

/** The spots of `shape` in space, the centre at the middle. */
function spots3d(t: Tree, shape: ExploreShape, options: ExploreShapeOptions): Map<string, ExploreSpot> {
  if (shape === 'free') {
    const previous = new Map<string, [number, number, number]>();
    for (const [k, s] of options.previous ?? []) previous.set(k, [s[0] / REACH, s[1] / REACH, (s[2] ?? 0) / REACH]);
    return centred(t, scaled(forceLayout3d(shapeOf(t, options.crossLinks), previous)));
  }
  if (shape === 'disc') {
    // a globe: the centre at the top, each ring further round toward the far side
    const most = Math.max(...t.depth.values()) + 1;
    const globe = new Map<string, Vec>(
      [...arcs(t)].map(([k, a]) => {
        const down = (Math.PI * 0.9 * (t.depth.get(k) as number)) / most;
        return [k, [DISC * Math.sin(down) * Math.cos(a), -DISC * Math.cos(down), DISC * Math.sin(down) * Math.sin(a)]];
      }),
    );
    return centred(t, globe);
  }
  // the rest are cones: the balanced map and the rings fan out all round, the trees along one way
  const way: Vec | undefined = shape === 'one-sided' ? [1, 0, 0] : shape === 'top-down' ? [0, 1, 0] : undefined;
  return cones(t, way, shape === 'rings');
}

/**
 * Each branch in a cone round its parent's way out. The centre's branches spread all round a sphere, or round `way`.
 * With `shells`, each step out sits on a shell round the centre, as rings do on a page.
 */
function cones(t: Tree, way: Vec | undefined, shells: boolean): Map<string, ExploreSpot> {
  const out = new Map<string, Vec>([[t.centre, [0, 0, 0]]]);
  const place = (k: string, dirs: Vec[]) => {
    (t.children.get(k) as string[]).forEach((c, i) => {
      const d = dirs[i] as Vec;
      const from: Vec = shells ? [0, 0, 0] : (out.get(k) as Vec);
      const r = shells ? RING * (t.depth.get(c) as number) : REACH;
      out.set(c, [from[0] + d[0] * r, from[1] + d[1] * r, from[2] + d[2] * r]);
      place(c, cone(d, (t.children.get(c) as string[]).length, CONE / 2));
    });
  };
  const n = (t.children.get(t.centre) as string[]).length;
  place(t.centre, way ? cone(way, n, CONE) : sphere(n));
  return out;
}

/** A way or a spot in space. */
type Vec = [number, number, number];

/** `n` ways out spread evenly over a sphere, the first straight up. */
function sphere(n: number): Vec[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? -1 : -1 + (2 * i) / (n - 1);
    const r = Math.sqrt(1 - y * y);
    return [r * Math.cos(golden * i), y, r * Math.sin(golden * i)];
  });
}

/** `n` ways out in a cone opening `half` radians round way `d`. One child goes straight along `d`. */
function cone(d: Vec, n: number, half: number): Vec[] {
  if (n <= 1) return n ? [d] : [];
  // two ways square to `d` and to each other, to turn round it
  const [x, y, z] = d;
  const pick: [number, number, number] = Math.abs(x) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross([x, y, z], pick)),
    v = cross([x, y, z], u);
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    const s = Math.sin(half),
      c = Math.cos(half);
    return unit([
      x * c + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * s,
      y * c + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * s,
      z * c + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * s,
    ]);
  });
}

/** The way square to both `a` and `b`. */
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** `a` made one long. */
const unit = (a: Vec): Vec => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The tree and its cross-links as a graph shape, for the force layouts. */
function shapeOf(t: Tree, crossLinks: readonly ExploreLink[] = []): GraphShape {
  const links: GraphShape['links'] = [];
  for (const [k, kids] of t.children) for (const c of kids) links.push({ from: k, type: 'step', to: c });
  const shown = new Set(t.keys);
  for (const l of crossLinks) if (shown.has(l.from) && shown.has(l.to)) links.push({ ...l, type: 'cross' });
  return { things: t.keys.map((key) => ({ key, text: key, kinds: [] })), links };
}

/** The force layouts' spots, where a link is about one long, made a branch's reach long. */
function scaled<S extends ExploreSpot>(spots: Map<string, S>): Map<string, S> {
  return new Map([...spots].map(([k, s]) => [k, s.map((v) => v * REACH) as S]));
}

/** `spots` moved so the centre sits at the middle. */
function centred<S extends ExploreSpot>(t: Tree, spots: Map<string, S>): Map<string, S> {
  const c = spots.get(t.centre);
  if (!c) return spots;
  return new Map([...spots].map(([k, s]) => [k, s.map((v, i) => v - (c[i] as number)) as S]));
}

/**
 * The spots, with every thing in `previous` kept where it was. A new thing keeps its fresh offset from its parent.
 * So a branch opens beside the thing it was opened from, and nothing on screen moves.
 */
function keptPut(
  t: Tree,
  fresh: Map<string, ExploreSpot>,
  previous: ReadonlyMap<string, ExploreSpot>,
): Map<string, ExploreSpot> {
  const out = new Map<string, ExploreSpot>();
  const dims = fresh.get(t.centre)?.length ?? 2;
  const parentOf = new Map<string, string>();
  for (const [k, kids] of t.children) for (const c of kids) parentOf.set(c, k);
  const fit = (s: ExploreSpot): ExploreSpot => (dims === 2 ? [s[0], s[1]] : [s[0], s[1], s[2] ?? 0]);
  for (const k of t.keys) {
    const was = previous.get(k);
    if (was) {
      out.set(k, fit(was));
      continue;
    }
    const spot = fresh.get(k) as ExploreSpot;
    const parent = parentOf.get(k);
    const [from, to] = [parent && fresh.get(parent), parent && out.get(parent)];
    out.set(k, from && to ? (spot.map((v, i) => v - (from[i] as number) + (to[i] as number)) as ExploreSpot) : spot);
  }
  return out;
}
