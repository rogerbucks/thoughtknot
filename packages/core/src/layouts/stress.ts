// The stress layout (editor spec §53, layout_stress). Roger, 25 Oct 2026: "we should have our own layout engine".
//
// Each pair of things is placed as far apart as the shortest path between them, counted in links. A pair that sits
// too near or too far is nudged toward its right distance, one pair at a time, in a shuffled order. The nudges start
// big and shrink each round (stochastic gradient descent, Zheng, Pawar and Goodman 2018). Every round gives a picture
// that can be shown, and about fifteen give a good one. So the same steps can run a few at a time in front of a person,
// each round a little better than the last.
//
// Near pairs count most, so a thing's neighbours sit round it and far parts only keep their rough place. Things not
// joined at all are kept one step past the farthest joined pair, so separate parts sit side by side.
//
// Up to `FULL_MOST` things every pair is used. Past it, each keeps its links and its distance to a set of
// pivots spread over the graph (sparse stress: Ortmann, Klimenta, Brandes 2016). So a round costs the things times
// the pivots, not their square.
//
// The same in two dimensions or three. Given last time's spots it starts from them and takes small steps only, so a
// small edit moves little. Host-free and pure: the same shape gives the same spots every time.
import type { GraphShape } from '../types-shape.ts';

/** The most things laid out with every pair; past it, with pivots. */
export const FULL_MOST = 1500;
/** How many pivots a large graph keeps each thing's distance to. */
const PIVOTS = 100;
/** Rounds from a cold start, and from a warm one. */
const ROUNDS = 30;
const WARM_ROUNDS = 10;
/** The smallest step, as a share of a pair's weight: the last rounds only settle. */
const EPSILON = 0.1;

/** Options for one run. `rounds` overrides how many; `unit` is how long one link is, in the spots' units. */
export interface StressOptions {
  rounds?: number;
  unit?: number;
  /** Keys whose spots do not move: the selected thing and its neighbours, or pinned things. */
  pinned?: ReadonlySet<string>;
}

/** A seeded random number source, so the shuffles, and so the spots, are the same each time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each thing's neighbours, by index, from the shape's links (either way round, no self links, no repeats). */
export function neighboursOf(shape: GraphShape): { keys: string[]; next: number[][] } {
  const keys = shape.things.map((t) => t.key);
  const index = new Map(keys.map((k, i) => [k, i]));
  const sets = keys.map(() => new Set<number>());
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a === undefined || b === undefined || a === b) continue;
    sets[a]?.add(b);
    sets[b]?.add(a);
  }
  return { keys, next: sets.map((s) => [...s].sort((p, q) => p - q)) };
}

/** Links from `from` to every thing, by breadth first search; -1 where it cannot reach. */
function hops(next: readonly number[][], from: number): Int32Array {
  const d = new Int32Array(next.length).fill(-1);
  const queue = new Int32Array(next.length);
  let head = 0,
    tail = 0;
  d[from] = 0;
  queue[tail++] = from;
  while (head < tail) {
    const v = queue[head++] as number;
    for (const w of next[v] ?? [])
      if (d[w] === -1) {
        d[w] = (d[v] as number) + 1;
        queue[tail++] = w;
      }
  }
  return d;
}

/** The pairs to place and the distance each wants, as flat arrays: from, to, distance. */
function pairsOf(next: readonly number[][]): { a: Int32Array; b: Int32Array; d: Float64Array } {
  const n = next.length;
  const as: number[] = [],
    bs: number[] = [],
    ds: number[] = [];
  if (n <= FULL_MOST) {
    const rows = next.map((_, i) => hops(next, i));
    let far = 1;
    for (const row of rows) for (const v of row) if (v > far) far = v;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const h = rows[i]?.[j] ?? -1;
        as.push(i);
        bs.push(j);
        ds.push(h < 0 ? far + 1 : h);
      }
  } else {
    // pivots spread out: each next one the farthest from those picked so far
    const picked: number[] = [0];
    const nearest = new Int32Array(n).fill(2 ** 30);
    const rows: Int32Array[] = [];
    while (picked.length < Math.min(PIVOTS, n)) {
      const row = hops(next, picked[picked.length - 1] as number);
      rows.push(row);
      let best = -1,
        far = -1;
      for (let v = 0; v < n; v++) {
        const h = row[v] as number;
        if (h >= 0 && h < (nearest[v] as number)) nearest[v] = h;
        if (h < 0) nearest[v] = Math.min(nearest[v] as number, 2 ** 29);
        if ((nearest[v] as number) > far && !picked.includes(v)) [far, best] = [nearest[v] as number, v];
      }
      if (best < 0) break;
      picked.push(best);
    }
    if (rows.length < picked.length) rows.push(hops(next, picked[picked.length - 1] as number));
    let far = 1;
    for (const row of rows) for (const v of row) if (v > far) far = v;
    for (let i = 0; i < n; i++)
      for (const j of next[i] ?? [])
        if (j > i) {
          as.push(i);
          bs.push(j);
          ds.push(1);
        }
    picked.forEach((p, k) => {
      const row = rows[k] as Int32Array;
      for (let v = 0; v < n; v++) {
        if (v === p) continue;
        const h = row[v] as number;
        as.push(p);
        bs.push(v);
        ds.push(h < 0 ? far + 1 : h);
      }
    });
  }
  return { a: Int32Array.from(as), b: Int32Array.from(bs), d: Float64Array.from(ds) };
}

/**
 * Each thing of `shape` placed by stress, in `dims` dimensions, in units where one link is `unit` long. Starts from
 * `previous` where a thing has a spot already, and then takes only the small late steps.
 */
export function stressLayout<D extends 2 | 3>(
  shape: GraphShape,
  dims: D,
  previous?: ReadonlyMap<string, readonly number[]>,
  options: StressOptions = {},
): Map<string, number[]> {
  const { keys, next } = neighboursOf(shape);
  const n = keys.length;
  const out = new Map<string, number[]>();
  if (!n) return out;
  const unit = options.unit ?? 1;
  const random = seeded(n * 7919 + shape.links.length);
  const pos = new Float64Array(n * dims);
  const warm = keys.filter((k) => previous?.has(k)).length >= n / 2;
  keys.forEach((k, i) => {
    const p = previous?.get(k);
    for (let c = 0; c < dims; c++) pos[i * dims + c] = p ? (p[c] ?? 0) : (random() - 0.5) * Math.sqrt(n) * unit;
  });
  // a new thing among placed ones starts beside a placed neighbour, so it does not fly in from far away
  if (warm)
    keys.forEach((k, i) => {
      if (previous?.has(k)) return;
      const near = (next[i] ?? []).find((j) => previous?.has(keys[j] as string));
      if (near === undefined) return;
      for (let c = 0; c < dims; c++) pos[i * dims + c] = (pos[near * dims + c] as number) + (random() - 0.5) * unit;
    });
  const fixed = new Uint8Array(n);
  keys.forEach((k, i) => (fixed[i] = options.pinned?.has(k) ? 1 : 0));
  const { a, b, d } = pairsOf(next);
  const m = a.length;
  let dMax = 1;
  for (let p = 0; p < m; p++) if ((d[p] as number) > dMax) dMax = d[p] as number;
  // the step size: big enough at first to move the farthest pair all the way, small at the end
  const etaMax = warm ? 1 : dMax * dMax,
    etaMin = EPSILON;
  const rounds = options.rounds ?? (warm ? WARM_ROUNDS : ROUNDS);
  const lambda = Math.log(etaMax / etaMin) / Math.max(1, rounds - 1);
  const order = new Int32Array(m);
  for (let p = 0; p < m; p++) order[p] = p;
  const delta = new Float64Array(dims);
  for (let r = 0; r < rounds; r++) {
    const eta = etaMax * Math.exp(-lambda * r);
    for (let p = m - 1; p > 0; p--) {
      const q = Math.floor(random() * (p + 1));
      const t = order[p] as number;
      order[p] = order[q] as number;
      order[q] = t;
    }
    for (let o = 0; o < m; o++) {
      const p = order[o] as number;
      const i = a[p] as number,
        j = b[p] as number;
      const want = (d[p] as number) * unit;
      let len2 = 0;
      for (let c = 0; c < dims; c++) {
        delta[c] = (pos[i * dims + c] as number) - (pos[j * dims + c] as number);
        len2 += (delta[c] as number) ** 2;
      }
      let len = Math.sqrt(len2);
      if (len < 1e-9) {
        // two in one spot: parted along a fixed slant, so the run stays the same each time
        for (let c = 0; c < dims; c++) delta[c] = ((i + j + c) % 3) - 1 || 0.5;
        len = Math.hypot(...delta);
      }
      const w = 1 / ((d[p] as number) * (d[p] as number));
      const mu = Math.min(1, eta * w);
      const move = (mu * (len - want)) / 2 / len;
      const fi = fixed[i] ? 0 : fixed[j] ? 2 : 1,
        fj = fixed[j] ? 0 : fixed[i] ? 2 : 1;
      for (let c = 0; c < dims; c++) {
        const s = (delta[c] as number) * move;
        pos[i * dims + c] = (pos[i * dims + c] as number) - s * fi;
        pos[j * dims + c] = (pos[j * dims + c] as number) + s * fj;
      }
    }
  }
  keys.forEach((k, i) => out.set(k, Array.from(pos.subarray(i * dims, i * dims + dims))));
  return out;
}
