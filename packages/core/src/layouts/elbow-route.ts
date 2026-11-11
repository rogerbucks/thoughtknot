// A right-angled link (editor spec §25, untangle_routing), for direct-links.ts. Graphviz drew these as its own `ortho`
// lines; now our own router does. Each link runs only across and down, from box to box, round the boxes in its way,
// with as few corners as it can. It is found on a sparse grid made of the edges of the boxes near it. Past a size, or
// where no way round is found, it takes one corner halfway between its boxes. Host-free and pure.
import type { Curve, Placed } from '../direct-curve.ts';
import type { MarkPoint } from '../plugin-diagrams.ts';

/** The room kept between a right-angled link and a box it passes, in pixels. */
const ELBOW_GAP = 10;
/** What one more corner costs, as pixels of length: a longer way with fewer corners reads better. */
const CORNER = 40;
/** The most grid points one link is looked for on; past it, the link takes its one corner halfway. */
const GRID_MOST = 40_000;
/** What leaving or reaching a box off its middle costs, as pixels of length: a link keeps to the middle unless crowded. */
const OFF_MIDDLE = 40;
/** What running along a piece another link already takes costs, as pixels of length: links keep apart where they can. */
const SHARED = 24;
/** The stretches of line links have taken so far, by the line they are on, so the next keeps off them (`elbowRoute`). */
export type Taken = Map<string, [number, number][]>;

/** How far past its two boxes a link may look for a way round, as a share of the room between them. */
const WIDEN = 0.5;

interface Edges {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const edgesOf = (b: Placed, gap: number): Edges => ({
  x0: b.x - b.hw - gap,
  y0: b.y - b.hh - gap,
  x1: b.x + b.hw + gap,
  y1: b.y + b.hh + gap,
});
/** `v` to a hundredth of a pixel, so the grid's lines and the boxes' middles are the same numbers. */
const r = (v: number) => Math.round(v * 100) / 100;
const sorted = (vs: number[]) => [...new Set(vs.map(r))].sort((p, q) => p - q);

/**
 * The corners of a right-angled link from box `a` to box `b`, from `a`'s edge to `b`'s, round each of `boxes` in the
 * way. `axis` is the drawing's way (0 across, 1 down). A link leaves and reaches its boxes that way where it can, as
 * Graphviz's did. Past the grid's size, its one corner is set across that way. Each piece it runs along is put in
 * `taken`, and it keeps off those already there.
 */
export function elbowRoute(
  a: Placed,
  b: Placed,
  boxes: readonly Placed[],
  axis: 0 | 1 = 0,
  taken: Taken = new Map(),
): MarkPoint[] {
  const ends = [edgesOf(a, 0), edgesOf(b, 0)];
  const room = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const reach = WIDEN * room + Math.max(a.hw, a.hh, b.hw, b.hh) * 2;
  const near: Edges = {
    x0: Math.min(a.x, b.x) - reach,
    y0: Math.min(a.y, b.y) - reach,
    x1: Math.max(a.x, b.x) + reach,
    y1: Math.max(a.y, b.y) + reach,
  };
  const others = boxes
    .filter((o) => o.key !== a.key && o.key !== b.key)
    .map((o) => edgesOf(o, ELBOW_GAP))
    .filter((e) => e.x1 > near.x0 && e.x0 < near.x1 && e.y1 > near.y0 && e.y0 < near.y1);
  const found = gridWay(a, b, others, ends, axis, taken);
  return clipped(found ?? oneCorner(a, b, axis), a, b);
}

/** The cheapest way from `a`'s middle to `b`'s across and down a grid of the box edges, missing `others`; none if shut. */
function gridWay(
  a: Placed,
  b: Placed,
  others: readonly Edges[],
  ends: readonly Edges[],
  axis: 0 | 1,
  taken: Taken,
): MarkPoint[] | undefined {
  // besides the box edges, lines through each end box's middle and halfway to its sides, where a link may leave or reach it
  const ports = (box: Placed, k: 'x' | 'y') => {
    const half = (k === 'x' ? box.hw : box.hh) / 2;
    return [box[k] - half, box[k], box[k] + half];
  };
  const xs = sorted([...ports(a, 'x'), ...ports(b, 'x'), (a.x + b.x) / 2, ...others.flatMap((e) => [e.x0, e.x1])]);
  const ys = sorted([...ports(a, 'y'), ...ports(b, 'y'), (a.y + b.y) / 2, ...others.flatMap((e) => [e.y0, e.y1])]);
  if (xs.length * ys.length > GRID_MOST) return undefined;
  const [w, h] = [xs.length, ys.length];
  const at = (i: number): MarkPoint => [xs[i % w] as number, ys[Math.floor(i / w)] as number];
  const { shut, shared } = piecesOf(xs, ys, others, taken);
  // inside one of the link's own boxes the way is free, and hidden: the line is drawn from where it leaves the box
  const [inA, inB] = ends.map((e) => {
    const inside = new Uint8Array(w * h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const [x, y] = [xs[i] as number, ys[j] as number];
        if (x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1) inside[i + j * w] = 1;
      }
    return inside;
  }) as [Uint8Array, Uint8Array];
  const start = xs.indexOf(r(a.x)) + w * ys.indexOf(r(a.y));
  const goal = xs.indexOf(r(b.x)) + w * ys.indexOf(r(b.y));
  const [ax, ay, bx, by] = [r(a.x), r(a.y), r(b.x), r(b.y)];
  // each state is a grid point and the way the link last ran there (0 across, 1 down, 2 not yet)
  const cost = new Float64Array(w * h * 3).fill(Infinity);
  const back = new Int32Array(w * h * 3).fill(-1);
  const queue = new Heap();
  // looked at nearest the goal first: the length left is never more than the way still to go costs (A*). The way
  // inside the last box is free, so its half sizes come off
  const left = (n: number) =>
    Math.max(0, Math.abs((xs[n % w] as number) - bx) + Math.abs((ys[Math.floor(n / w)] as number) - by) - b.hw - b.hh);
  cost[start * 3 + 2] = 0;
  queue.push(start * 3 + 2, left(start));
  for (let top = queue.pop(); top; top = queue.pop()) {
    const [s, key] = top;
    const here = cost[s] as number;
    const [node, way] = [Math.floor(s / 3), s % 3];
    // a state reached again more cheaply since it was queued is looked at from there
    if (key > here + left(node)) continue;
    if (node === goal) return wayBack(s, back, at, taken);
    const [i, j] = [node % w, Math.floor(node / w)];
    for (let d = 0; d < 4; d++) {
      const turn = d < 2 ? 0 : 1;
      const [ni, nj] = [i + (d === 0 ? 1 : d === 1 ? -1 : 0), j + (d === 2 ? 1 : d === 3 ? -1 : 0)];
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      // the piece between the two points, by its place in its row or column
      const piece = turn ? Math.min(j, nj) * w + i : j * (w - 1) + Math.min(i, ni);
      if (shut[turn][piece]) continue;
      const next = ni + nj * w;
      // a corner costs, and so does a piece another link runs along, and leaving or reaching a box sideways
      const hidden = (inA[node] && inA[next]) || (inB[node] && inB[next]);
      const long = turn
        ? Math.abs((ys[j] as number) - (ys[nj] as number))
        : Math.abs((xs[i] as number) - (xs[ni] as number));
      const leaving = inA[node] && !inA[next],
        reaching = !inB[node] && inB[next];
      const middle = leaving
        ? turn
          ? xs[i] === ax
          : ys[j] === ay
        : reaching
          ? turn
            ? xs[i] === bx
            : ys[j] === by
          : true;
      const ends = (leaving || reaching ? (turn !== axis ? 2 * CORNER : 0) : 0) + (middle ? 0 : OFF_MIDDLE);
      const corner = way !== 2 && way !== turn ? CORNER : 0;
      const step = hidden ? here : here + long + (shared[turn][piece] ? SHARED : 0) + ends + corner;
      const t = next * 3 + (hidden ? 2 : turn);
      if (step < (cost[t] as number)) {
        cost[t] = step;
        back[t] = s;
        queue.push(t, step + left(next));
      }
    }
  }
  return undefined;
}

/** The line a piece across or down is on, and the stretch of it the piece takes. */
const stretchOf = (p: MarkPoint, q: MarkPoint): [string, number, number] =>
  p[0] === q[0]
    ? [`x${p[0]}`, Math.min(p[1], q[1]), Math.max(p[1], q[1])]
    : [`y${p[1]}`, Math.min(p[0], q[0]), Math.max(p[0], q[0])];
/**
 * Each piece of the grid `xs` by `ys`, across (0) and down (1). It says whether the piece is shut, inside one of
 * `others` (the grid holds every box edge). And it says whether another link in `taken` already runs along it.
 */
function piecesOf(xs: readonly number[], ys: readonly number[], others: readonly Edges[], taken: Taken) {
  const [w, h] = [xs.length, ys.length];
  const shut = [new Uint8Array(Math.max(0, w - 1) * h), new Uint8Array(w * Math.max(0, h - 1))] as const;
  const shared = [new Uint8Array(shut[0].length), new Uint8Array(shut[1].length)] as const;
  const [ix, iy] = [new Map(xs.map((v, k) => [v, k])), new Map(ys.map((v, k) => [v, k]))];
  for (const e of others) {
    // the grid holds each box's edges, so the pieces inside it run between them
    const [i0, i1, j0, j1] = [ix.get(r(e.x0)), ix.get(r(e.x1)), iy.get(r(e.y0)), iy.get(r(e.y1))];
    if (i0 === undefined || i1 === undefined || j0 === undefined || j1 === undefined) continue;
    for (let j = j0 + 1; j < j1; j++) for (let i = i0; i < i1; i++) shut[0][j * (w - 1) + i] = 1;
    for (let j = j0; j < j1; j++) for (let i = i0 + 1; i < i1; i++) shut[1][j * w + i] = 1;
  }
  for (let j = 0; j < h; j++)
    for (const [lo, hi] of taken.get(`y${ys[j]}`) ?? [])
      for (let i = 0; i + 1 < w; i++)
        if ((xs[i] as number) < hi && (xs[i + 1] as number) > lo) shared[0][j * (w - 1) + i] = 1;
  for (let i = 0; i < w; i++)
    for (const [lo, hi] of taken.get(`x${xs[i]}`) ?? [])
      for (let j = 0; j + 1 < h; j++)
        if ((ys[j] as number) < hi && (ys[j + 1] as number) > lo) shared[1][j * w + i] = 1;
  return { shut, shared };
}
/** Puts the piece from `p` to `q` in `taken`. */
function take(taken: Taken, p: MarkPoint, q: MarkPoint): void {
  const [line, lo, hi] = stretchOf(p, q);
  taken.set(line, [...(taken.get(line) ?? []), [lo, hi]]);
}

/**
 * The grid points from the start to state `s`, each corner kept and each point on a straight run dropped. Each piece is
 * put in `taken`.
 */
function wayBack(s: number, back: Int32Array, at: (i: number) => MarkPoint, taken: Taken): MarkPoint[] {
  const all: MarkPoint[] = [];
  for (let t = s; t >= 0; t = back[t] as number) all.unshift(at(Math.floor(t / 3)));
  for (let k = 1; k < all.length; k++) take(taken, all[k - 1] as MarkPoint, all[k] as MarkPoint);
  return all.filter((p, k) => {
    const [o, q] = [all[k - 1], all[k + 1]];
    return !o || !q || !((o[0] === p[0] && p[0] === q[0]) || (o[1] === p[1] && p[1] === q[1]));
  });
}

/** The way from `a`'s middle to `b`'s with its corners halfway between them, across the drawing's `axis`. */
function oneCorner(a: Placed, b: Placed, axis: 0 | 1): MarkPoint[] {
  if (a.x === b.x || a.y === b.y)
    return [
      [a.x, a.y],
      [b.x, b.y],
    ];
  const m = axis === 0 ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
  return axis === 0
    ? [
        [a.x, a.y],
        [m, a.y],
        [m, b.y],
        [b.x, b.y],
      ]
    : [
        [a.x, a.y],
        [a.x, m],
        [b.x, m],
        [b.x, b.y],
      ];
}

/** `way` from middle to middle, its ends moved out to the edges of `a` and `b`, where it leaves and reaches them. */
function clipped(way: MarkPoint[], a: Placed, b: Placed): MarkPoint[] {
  const inside = (box: Placed, p: MarkPoint) => Math.abs(p[0] - box.x) <= box.hw && Math.abs(p[1] - box.y) <= box.hh;
  // where the piece from `p`, inside `box`, to `q`, outside it, crosses its edge
  const edge = (box: Placed, p: MarkPoint, q: MarkPoint): MarkPoint =>
    p[0] === q[0] ? [p[0], box.y + Math.sign(q[1] - p[1]) * box.hh] : [box.x + Math.sign(q[0] - p[0]) * box.hw, p[1]];
  let from = 0;
  while (from + 1 < way.length && inside(a, way[from + 1] as MarkPoint)) from++;
  let to = way.length - 1;
  while (to - 1 > from && inside(b, way[to - 1] as MarkPoint)) to--;
  if (to <= from) return way;
  const out = way.slice(from, to + 1).map((p): MarkPoint => [p[0], p[1]]);
  out[0] = edge(a, way[from] as MarkPoint, way[from + 1] as MarkPoint);
  out[out.length - 1] = edge(b, way[to] as MarkPoint, way[to - 1] as MarkPoint);
  return out;
}

/** `p` moved `by` toward `q`. */
function toward(p: MarkPoint, q: MarkPoint, by: number): MarkPoint {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [p[0] + ((q[0] - p[0]) * by) / d, p[1] + ((q[1] - p[1]) * by) / d];
}

/** A right-angled link through the corners `way`, from its first point to its last, as a curve direct-links.ts draws. */
export function elbowCurve(way: readonly MarkPoint[]): Curve {
  const p0 = way[0] as MarkPoint,
    p3 = way[way.length - 1] as MarkPoint;
  const lengths = way
    .slice(1)
    .map((q, i) => Math.hypot(q[0] - (way[i] as MarkPoint)[0], q[1] - (way[i] as MarkPoint)[1]));
  const total = lengths.reduce((t, l) => t + l, 0) || 1;
  // the point a share `t` of the way along, and the way the line runs there
  const along = (t: number): [MarkPoint, MarkPoint] => {
    let left = t * total;
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i] as number,
        p = way[i] as MarkPoint,
        q = way[i + 1] as MarkPoint;
      if (left <= l || i === lengths.length - 1) {
        const u = l ? Math.min(1, left / l) : 0;
        return [
          [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u],
          [q[0] - p[0], q[1] - p[1]],
        ];
      }
      left -= l;
    }
    return [p3, [p3[0] - p0[0], p3[1] - p0[1]]];
  };
  return {
    at: (t) => along(t)[0],
    ends: [p0, p3],
    cubic(cutStart, cutEnd) {
      // each straight piece written as Graphviz's cubic one, its ends drawn in where an arrowhead takes their place
      const ps = way.map((p): MarkPoint => [p[0], p[1]]);
      if (ps.length >= 2) {
        ps[0] = toward(ps[0] as MarkPoint, ps[1] as MarkPoint, cutStart);
        ps[ps.length - 1] = toward(ps[ps.length - 1] as MarkPoint, ps[ps.length - 2] as MarkPoint, cutEnd);
      }
      const out: MarkPoint[] = [ps[0] as MarkPoint];
      for (let i = 0; i + 1 < ps.length; i++) {
        const [p, q] = [ps[i] as MarkPoint, ps[i + 1] as MarkPoint];
        out.push(
          [p[0] + (q[0] - p[0]) / 3, p[1] + (q[1] - p[1]) / 3],
          [p[0] + ((q[0] - p[0]) * 2) / 3, p[1] + ((q[1] - p[1]) * 2) / 3],
          q,
        );
      }
      return out;
    },
    tipAt(atStart) {
      // the line meets its box running straight, so its arrowhead points along its last piece
      const tip = atStart ? p0 : p3;
      const from = (atStart ? way[1] : way[way.length - 2]) ?? (atStart ? p3 : p0);
      return [tip, (Math.atan2(tip[1] - from[1], tip[0] - from[0]) * 180) / Math.PI];
    },
    wordsAt(t, off) {
      // words sit just above the line where it runs across, and beside it where it runs up or down
      const [[x, y], [dx, dy]] = along(t);
      const long = Math.hypot(dx, dy) || 1;
      const flip = dx >= 0 ? -1 : 1;
      return [x - (dy / long) * off * flip, y + (dx / long) * off * flip];
    },
  };
}

/** The states still to look at, cheapest first, kept in two growing arrays so no pair is made for each. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  push(item: number, key: number): void {
    const [a, k] = [this.items, this.keys];
    let i = a.length;
    a.push(item);
    k.push(key);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if ((k[up] as number) <= key) break;
      [a[i], k[i]] = [a[up] as number, k[up] as number];
      i = up;
    }
    [a[i], k[i]] = [item, key];
  }
  pop(): [number, number] | undefined {
    const [a, k] = [this.items, this.keys];
    if (!a.length) return undefined;
    const top: [number, number] = [a[0] as number, k[0] as number];
    const [item, key] = [a.pop() as number, k.pop() as number];
    const n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let m = i,
          mk = key;
        if (l < n && (k[l] as number) < mk) [m, mk] = [l, k[l] as number];
        if (r < n && (k[r] as number) < mk) [m, mk] = [r, k[r] as number];
        if (m === i) break;
        [a[i], k[i]] = [a[m] as number, k[m] as number];
        i = m;
      }
      [a[i], k[i]] = [item, key];
    }
    return top;
  }
}
