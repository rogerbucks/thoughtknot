// The globe: every thing on a sphere (editor spec §71, globe_layout). Roger, 31 Oct 2026: the 3D view was taken for a
// globe you spin round and look at. The molecule looks good for a moment, then is little use. Keep every view, and
// add a globe seen from outside that you dive into, with detail as you near it.
//
// Things are laid along a spiral from one pole, in the order a walk from the centre reaches them. So linked things
// start near each other. A few rounds then pull each link's ends together over the surface and push near things
// apart. The centre stays at the pole, which faces the camera as the space view opens (space-view.ts orbitFit).
//
// The sphere grows with the number of things, so each has about the same room. Given last time's spots, it keeps
// their size, a thing placed already keeps its spot exactly, and a new one starts beside a placed neighbour. Links run as arcs over the
// surface, a little above it. Host-free and pure: the same graph gives the same globe every time.

/** A point in space. */
export type GlobeVec = [number, number, number];

/** What the globe needs of a graph: its things' keys in written order, and its links. */
export interface GlobeShape {
  things: readonly { key: string }[];
  links: readonly { from: string; to: string }[];
}

/** What else the globe takes: the thing at its pole, last time's spots, and the room round each thing. */
export interface GlobeOptions {
  centre?: string;
  previous?: ReadonlyMap<string, GlobeVec>;
  /** Pixels of the space between neighbours on the surface. */
  spacing?: number;
}

/** A globe: its radius, and each thing's spot on it, round the origin. */
export interface Globe {
  radius: number;
  spots: Map<string, GlobeVec>;
}

/** The way the pole faces: toward the camera as the space view opens, from the front and above. */
export const GLOBE_FACING: GlobeVec = unit([0, -Math.cos(0.9), Math.sin(0.9)]);
/** Pixels between neighbours, and the smallest radius, so a few things do not crowd a tiny ball. */
const SPACING = 140;
const LEAST_RADIUS = 160;
/** Rounds of pulling and pushing, fewer past ROOMY things, and how far each round moves things. */
const ROUNDS = 40;
const LEAST_ROUNDS = 10;
const ROOMY = 500;
const STEP = 0.2;
/** How far above the surface links run, and the widest angle one arc's step spans. */
const LIFT = 1.03;
const ARC_STEP = 0.12;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Each thing of `shape` placed on a globe, its centre (or best-linked thing) facing the viewer. */
export function globeSpots(shape: GlobeShape, options: GlobeOptions = {}): Globe {
  const keys = shape.things.map((t) => t.key);
  const n = keys.length;
  // given last time's spots, the globe keeps last time's size, so nothing on screen moves as more opens
  const [was] = options.previous?.values() ?? [];
  const radius = was
    ? Math.hypot(...was)
    : Math.max(LEAST_RADIUS, (options.spacing ?? SPACING) * Math.sqrt(n / (4 * Math.PI)));
  const near = neighbours(keys, shape.links);
  const order = walk(keys, near, options.centre);
  // the spiral's frame: its pole is the way the globe faces
  const [side, up] = frameOf(GLOBE_FACING);
  const dir = new Map<string, GlobeVec>();
  order.forEach((k, i) => {
    // the first thing walked sits on the pole itself, the last on the far side
    const z = n > 1 ? 1 - (2 * i) / (n - 1) : 1,
      ring = Math.sqrt(Math.max(0, 1 - z * z)),
      a = i * GOLDEN;
    dir.set(k, unit(add(scale(GLOBE_FACING, z), add(scale(side, ring * Math.cos(a)), scale(up, ring * Math.sin(a))))));
  });
  // a thing placed last time keeps its spot; a new one starts beside a placed neighbour
  const fixed = new Set<string>();
  for (const k of order) {
    const was = options.previous?.get(k);
    if (was) {
      dir.set(k, unit(was));
      fixed.add(k);
    }
  }
  if (fixed.size)
    for (const k of order) {
      if (fixed.has(k)) continue;
      const by = (near.get(k) ?? []).find((o) => fixed.has(o));
      const at = by && dir.get(by);
      if (at) dir.set(k, unit(add(at, scale(dir.get(k) as GlobeVec, 0.15))));
    }
  const root = order[0];
  if (root !== undefined && !fixed.has(root) && !fixed.size) fixed.add(root);
  relax(order, dir, near, fixed, Math.sqrt((4 * Math.PI) / Math.max(1, n)));
  // a thing kept from last time gets its very spot back, not one rounded on the way through
  const spot = (k: string): GlobeVec => {
    const kept = options.previous?.get(k);
    return kept ? [kept[0], kept[1], kept[2]] : scale(dir.get(k) as GlobeVec, radius);
  };
  return { radius, spots: new Map(order.map((k) => [k, spot(k)])) };
}

/** The points of an arc over a globe of `radius` from `a` to `b`, a little above its surface. */
export function globeArc(a: GlobeVec, b: GlobeVec, radius: number): GlobeVec[] {
  const p = unit(a),
    q = unit(b);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(p, q))));
  const steps = Math.max(1, Math.ceil(angle / ARC_STEP));
  const out: GlobeVec[] = [];
  for (let i = 0; i <= steps; i++) out.push(scale(slerp(p, q, angle, i / steps), radius * LIFT));
  return out;
}

/** Each thing's neighbours, in the order their links are written, none to itself. */
function neighbours(keys: readonly string[], links: GlobeShape['links']): Map<string, string[]> {
  const near = new Map<string, string[]>(keys.map((k) => [k, []]));
  for (const { from, to } of links) {
    if (from === to || !near.has(from) || !near.has(to)) continue;
    near.get(from)?.push(to);
    near.get(to)?.push(from);
  }
  return near;
}

/**
 * The things in the order a walk reaches them: from `centre`, else the best-linked thing, step by step out. Each part
 * not reached is walked in turn, the biggest first, from its best-linked thing.
 */
function walk(keys: readonly string[], near: Map<string, string[]>, centre?: string): string[] {
  const links = (k: string) => near.get(k)?.length ?? 0;
  const at = new Map(keys.map((k, i) => [k, i]));
  const best = (from: readonly string[]) =>
    [...from].sort((a, b) => links(b) - links(a) || (at.get(a) ?? 0) - (at.get(b) ?? 0))[0];
  const seen = new Set<string>(),
    order: string[] = [];
  const from = (start: string) => {
    const ring = [start];
    seen.add(start);
    while (ring.length) {
      const k = ring.shift() as string;
      order.push(k);
      for (const o of near.get(k) ?? [])
        if (!seen.has(o)) {
          seen.add(o);
          ring.push(o);
        }
    }
  };
  if (centre !== undefined && at.has(centre)) from(centre);
  for (let left = keys.filter((k) => !seen.has(k)); left.length; left = keys.filter((k) => !seen.has(k)))
    from(best(left) as string);
  return order;
}

/**
 * Rounds that pull each link's ends together and push things nearer than `room` apart, over the unit sphere. The
 * `fixed` things never move. Each thing is pushed only by those in its own and the next cells of a grid.
 */
function relax(
  order: readonly string[],
  dir: Map<string, GlobeVec>,
  near: Map<string, string[]>,
  fixed: ReadonlySet<string>,
  room: number,
): void {
  const moving = order.filter((k) => !fixed.has(k));
  if (!moving.length) return;
  // a big globe takes fewer rounds: the spiral has already spaced it evenly
  const rounds = Math.max(LEAST_ROUNDS, Math.round(ROUNDS * Math.min(1, ROOMY / order.length)));
  for (let round = 0; round < rounds; round++) {
    const cells = gridOf(order, dir, room);
    const moves = new Map<string, GlobeVec>();
    for (const k of moving) {
      const p = dir.get(k) as GlobeVec;
      let move: GlobeVec = [0, 0, 0];
      for (const o of near.get(k) ?? []) move = add(move, scale(sub(dir.get(o) as GlobeVec, p), 0.5));
      for (const o of nearby(cells, p, room)) {
        if (o === k) continue;
        const d = sub(p, dir.get(o) as GlobeVec),
          gap = Math.sqrt(dot(d, d));
        if (gap < room && gap > 1e-9) move = add(move, scale(d, (room - gap) / gap));
      }
      moves.set(k, move);
    }
    for (const [k, move] of moves) dir.set(k, unit(add(dir.get(k) as GlobeVec, scale(move, STEP))));
  }
}

/** The cell of a grid `size` wide that a point falls in, moved by `x`, `y` and `z` cells, as one number. */
const cellOf = (p: GlobeVec, size: number, x = 0, y = 0, z = 0): number =>
  (Math.floor(p[0] / size) + x + 512) * 1048576 +
  (Math.floor(p[1] / size) + y + 512) * 1024 +
  (Math.floor(p[2] / size) + z + 512);

/** The things in each cell of a grid `size` wide. */
function gridOf(order: readonly string[], dir: Map<string, GlobeVec>, size: number): Map<number, string[]> {
  const cells = new Map<number, string[]>();
  for (const k of order) {
    const c = cellOf(dir.get(k) as GlobeVec, size),
      in_ = cells.get(c);
    if (in_) in_.push(k);
    else cells.set(c, [k]);
  }
  return cells;
}

/** The things in the cell of `p` and the 26 round it: all that can be nearer than one cell. */
function nearby(cells: Map<number, string[]>, p: GlobeVec, size: number): string[] {
  const out: string[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) for (const k of cells.get(cellOf(p, size, x, y, z)) ?? []) out.push(k);
  return out;
}

/** Two ways square to `v` and to each other, so a spiral can be laid round it. */
function frameOf(v: GlobeVec): [GlobeVec, GlobeVec] {
  const other: GlobeVec = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const side = unit(cross(v, other));
  return [side, cross(v, side)];
}

/** The point `t` of the way along the great circle from `p` to `q`, which are `angle` apart. */
function slerp(p: GlobeVec, q: GlobeVec, angle: number, t: number): GlobeVec {
  if (angle < 1e-6) return p;
  const s = Math.sin(angle);
  if (s < 1e-6) {
    // opposite ends: go round by any way square to them
    const [side] = frameOf(p);
    return unit(add(scale(p, Math.cos(Math.PI * t)), scale(side, Math.sin(Math.PI * t))));
  }
  return add(scale(p, Math.sin((1 - t) * angle) / s), scale(q, Math.sin(t * angle) / s));
}

function add(a: GlobeVec, b: GlobeVec): GlobeVec {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: GlobeVec, b: GlobeVec): GlobeVec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: GlobeVec, k: number): GlobeVec {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function dot(a: GlobeVec, b: GlobeVec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: GlobeVec, b: GlobeVec): GlobeVec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(a: GlobeVec): GlobeVec {
  const l = Math.sqrt(dot(a, a));
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 1];
}
