// The layered layout of our own engine (editor spec §53, layout_layered). Roger, 25 Oct 2026: "we should have our own
// layout engine".
//
// Things are put in rows, so most links run one way, from one row to a later one, as a flow or a tree reads. It is the
// method Graphviz's dot follows (Sugiyama, Tagawa and Toda 1981), kept lean:
// 1. links that run back against the flow are turned round, found by a search from each start;
// 2. each thing goes in the row after the latest of the things that link to it (longest path);
// 3. a link that skips rows passes through a stand-in in each row it crosses, so it is ordered like the rest;
// 4. each row is ordered by where its neighbours sit in the rows round it (the median), a few sweeps down and up;
// 5. each thing is pulled across toward its neighbours, its row kept in order and its boxes apart.
// Given last time's spots, rows start in last time's order, so a small edit keeps the drawing as it was.
//
// Spots are box middles in CSS pixels, across (`LR`: rows run left to right) or down (`TB`). Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { rowsOf, wrapped } from './layered-rows.ts';
import { layoutOptions } from './layout-options.ts';
import type { LayoutOptions } from './layout-options.ts';

/** A box's size, in CSS pixels. */
export type Size = readonly [number, number];

/** The room between two boxes in one row, and between two rows, in CSS pixels. */
const GAP = 18;
const ROW_GAP = 56;
/** Sweeps of ordering rows by their neighbours, and rounds of pulling things across. */
const SWEEPS = 24;
/** The most rounds of swapping neighbours after each sweep. */
const TRANSPOSE_ROUNDS = 6;
/** Fresh starts of the ordering, rows shuffled, that a small drawing such as an overview is given (own-engine.ts). */
export const RESTARTS = 40;
const PULLS = 12;
/** The room a link bending through a row takes, and between two such links, in CSS pixels. */
const LANE = 8;
const LANE_GAP = 4;

/** One thing or stand-in to place: its row, its size across the rows, and its neighbours in the rows either side. */
interface Item {
  row: number;
  across: number;
  up: number[];
  down: number[];
  /** A stand-in's link: the things at its two ends. */
  ends?: readonly [number, number];
}

/** A layered layout: each thing's middle, and the bends of each link that skips rows, by `from` and `to` keys. */
export interface Layered {
  spots: Map<string, [number, number]>;
  via: Map<string, [number, number][]>;
}

/** The type of a link that stands for a trunk (own-engine.ts): it takes stand-ins of its own, shared with no other. */
export const TRUNK_LINK = 'trunk';

/** The key of a link from `from` to `to`, for `Layered.via`. */
export const viaKey = (from: string, to: string): string => `${from}\n${to}`;

/** The crossings between two rows, as links from places in one to places in the next: inversions, by merge sort. */
function crossingsOf(pairs: [number, number][]): number {
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const xs = pairs.map((p) => p[1]);
  let count = 0;
  const sort = (lo: number, hi: number): number[] => {
    if (hi - lo <= 1) return xs.slice(lo, hi);
    const mid = (lo + hi) >> 1;
    const a = sort(lo, mid),
      b = sort(mid, hi);
    const merged: number[] = [];
    let i = 0,
      j = 0;
    while (i < a.length || j < b.length)
      if (j >= b.length || (i < a.length && (a[i] as number) <= (b[j] as number))) merged.push(a[i++] as number);
      else {
        count += a.length - i;
        merged.push(b[j++] as number);
      }
    return merged;
  };
  sort(0, xs.length);
  return count;
}

/** Each thing of `shape` placed in rows, as `layered` places it. */
export function layeredLayout(
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size> = new Map(),
  rankdir: 'LR' | 'TB' = 'LR',
  previous?: ReadonlyMap<string, readonly number[]>,
  options: Partial<LayoutOptions> = {},
): Map<string, [number, number]> {
  return layered(shape, sizes, rankdir, previous, options).spots;
}

/**
 * Each thing of `shape` placed in rows, its middle in CSS pixels, and the bends of each link that skips rows. `sizes`
 * gives each box's width and height (absent: 120 by 40). `rankdir` is `LR` (rows left to right) or `TB` (top to
 * bottom). `previous` orders the rows as last time. `tries` is how many times more the rows are ordered afresh.
 */
export function layered(
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size> = new Map(),
  rankdir: 'LR' | 'TB' = 'LR',
  previous?: ReadonlyMap<string, readonly number[]>,
  options: Partial<LayoutOptions> = {},
  tries = 0,
): Layered {
  // the room beside each thing as `spacing` asks, and between rows, where links run, as `linkLength` asks
  const { spacing, linkLength } = layoutOptions(options);
  const gap = GAP * spacing,
    rowGap = ROW_GAP * linkLength;
  const keys = shape.things.map((t) => t.key);
  const n = keys.length;
  const out: Layered = { spots: new Map(), via: new Map() };
  if (!n) return out;
  const index = new Map(keys.map((k, i) => [k, i]));
  const across = rankdir === 'LR' ? 1 : 0; // which size runs across a row
  const sizeOf = (i: number): Size => sizes.get(keys[i] as string) ?? [120, 40];
  const links: number[][] = keys.map(() => []);
  const seen = new Set<string>(),
    alone = new Set<string>();
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a === undefined || b === undefined || a === b || seen.has(`${a} ${b}`)) continue;
    seen.add(`${a} ${b}`);
    if (l.type === TRUNK_LINK) alone.add(`${a} ${b}`);
    (links[a] as number[]).push(b);
  }
  const rows = wrapped(rowsOf(n, links), links, (i) => sizeOf(i), across, gap, rowGap);
  // the items: things, then a stand-in in each row a link skips, which the link bends through
  const items: Item[] = keys.map((_, i) => ({ row: rows[i] as number, across: sizeOf(i)[across], up: [], down: [] }));
  const chainOf = new Map<string, number[]>();
  // the links out of one thing share each stand-in until they part, so they run as one line that branches
  const shared = new Map<string, number>();
  links.forEach((next, v) => {
    for (const w of next) {
      let from = v;
      const via: number[] = [];
      for (let r = (rows[v] as number) + 1; r < (rows[w] as number); r++) {
        const known = alone.has(`${v} ${w}`) ? undefined : shared.get(`${v} ${r}`);
        if (known === undefined) {
          items.push({ row: r, across: LANE, up: [from], down: [], ends: [v, w] });
          (items[from] as Item).down.push(items.length - 1);
          if (!alone.has(`${v} ${w}`)) shared.set(`${v} ${r}`, items.length - 1);
        }
        from = known ?? items.length - 1;
        via.push(from);
      }
      (items[w] as Item).up.push(from);
      (items[from] as Item).down.push(w);
      chainOf.set(`${v} ${w}`, via);
    }
  });
  const rowCount = Math.max(...rows) + 1;
  const byRow: number[][] = Array.from({ length: rowCount }, () => []);
  items.forEach((it, i) => (byRow[it.row] as number[]).push(i));
  // start in last time's order where there is one, else in the order a search from each start reaches them. A tree
  // so ordered has no crossings at all
  const reached = new Int32Array(items.length).fill(-1);
  let count = 0;
  const reach = (start: number) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop() as number;
      if ((reached[i] as number) >= 0) continue;
      reached[i] = count++;
      const down = (items[i] as Item).down;
      for (let k = down.length - 1; k >= 0; k--) stack.push(down[k] as number);
    }
  };
  for (let i = 0; i < items.length; i++) if (!(items[i] as Item).up.length) reach(i);
  for (let i = 0; i < items.length; i++) reach(i);
  const was = (i: number) => {
    const p = i < n ? previous?.get(keys[i] as string) : undefined;
    return p ? (p[across] ?? 0) : Infinity;
  };
  for (const row of byRow) row.sort((p, q) => was(p) - was(q) || (reached[p] as number) - (reached[q] as number));
  const place = new Float64Array(items.length);
  const reorder = (row: number[], side: 'up' | 'down') => {
    const median = new Map<number, number>();
    for (const i of row) {
      const ns = (items[i] as Item)[side].map((j) => place[j] as number).sort((p, q) => p - q);
      median.set(
        i,
        ns.length ? ((ns[(ns.length - 1) >> 1] as number) + (ns[ns.length >> 1] as number)) / 2 : (place[i] as number),
      );
    }
    row.sort(
      (p, q) => (median.get(p) as number) - (median.get(q) as number) || (place[p] as number) - (place[q] as number),
    );
    row.forEach((i, k) => (place[i] = k));
  };
  const crossings = () => {
    let total = 0;
    for (let r = 0; r + 1 < rowCount; r++)
      total += crossingsOf(
        (byRow[r] as number[]).flatMap((i) =>
          (items[i] as Item).down.map((j): [number, number] => [place[i] as number, place[j] as number]),
        ),
      );
    return total;
  };
  // the crossings of the links of `u` with those of `v`, `u` placed before `v`, on both sides
  const pairCrossings = (u: number, v: number) => {
    let c = 0;
    for (const side of ['up', 'down'] as const)
      for (const a of (items[u] as Item)[side])
        for (const b of (items[v] as Item)[side]) if ((place[a] as number) > (place[b] as number)) c++;
    return c;
  };
  // two neighbours in a row swap places while that crosses fewer links (Gansner and others 1993)
  const transpose = () => {
    for (let round = 0; round < TRANSPOSE_ROUNDS; round++) {
      let better = false;
      for (const row of byRow)
        for (let k = 0; k + 1 < row.length; k++) {
          const u = row[k] as number,
            v = row[k + 1] as number;
          if (pairCrossings(u, v) > pairCrossings(v, u)) {
            row[k] = v;
            row[k + 1] = u;
            place[u] = k + 1;
            place[v] = k;
            better = true;
          }
        }
      if (!better) break;
    }
  };
  // sweeps down and up, each row ordered by its neighbours' median; the order with fewest crossings is kept
  for (const row of byRow) row.forEach((i, k) => (place[i] = k));
  let best = crossings(),
    bestRows = byRow.map((row) => row.slice());
  // then again from shuffled rows, as `tries` asks, as sweeps alone can stop in a poor order. The shuffles are seeded,
  // so a graph is always drawn the same
  const first = bestRows.map((row) => row.slice());
  let seed = 2463534242;
  const random = () => ((seed ^= seed << 13), (seed ^= seed >>> 17), (seed ^= seed << 5), (seed >>> 0) / 4294967296);
  for (let t = 0; t <= tries && best; t++) {
    if (t)
      first.forEach((row, r) => {
        const shuffled = row.slice();
        for (let k = shuffled.length - 1; k > 0; k--) {
          const j = Math.floor(random() * (k + 1));
          [shuffled[k], shuffled[j]] = [shuffled[j] as number, shuffled[k] as number];
        }
        byRow[r] = shuffled;
        shuffled.forEach((i, k) => (place[i] = k));
      });
    for (let s = 0; s < SWEEPS && best; s++) {
      if (s % 2 === 0) for (let r = 1; r < rowCount; r++) reorder(byRow[r] as number[], 'up');
      else for (let r = rowCount - 2; r >= 0; r--) reorder(byRow[r] as number[], 'down');
      transpose();
      const now = crossings();
      if (now < best) [best, bestRows] = [now, byRow.map((row) => row.slice())];
    }
  }
  bestRows.forEach((row, r) => {
    byRow[r] = row;
    row.forEach((i, k) => (place[i] = k));
  });
  // across: packed in order, then pulled toward neighbours, kept in order and apart. Stand-ins take a lane's room,
  // so the links that bend through them pass between boxes, never over one.
  const at = new Float64Array(items.length);
  const gapOf = (p: number, i: number) => {
    const a = items[p] as Item,
      b = items[i] as Item;
    return (a.across + b.across) / 2 + (a.ends && b.ends ? LANE_GAP : a.ends || b.ends ? gap / 2 : gap);
  };
  // each kept past the one before it by the room between them; `way` -1 runs leftward
  const keepApart = (row: number[], way: 1 | -1) => {
    for (let o = 1; o < row.length; o++) {
      const k = way === 1 ? o : row.length - 1 - o;
      const i = row[k] as number,
        before = row[k - way] as number;
      const bound = (at[before] as number) + way * gapOf(before, i);
      if (way * ((at[i] as number) - bound) < 0) at[i] = bound;
    }
  };
  for (const row of byRow) {
    let x = 0;
    row.forEach((i, k) => {
      if (k) x += gapOf(row[k - 1] as number, i);
      at[i] = x;
    });
  }
  const settle = (row: number[]) => {
    const want = row.map((i) => {
      const it = items[i] as Item;
      const ns = [...it.up, ...it.down];
      return ns.length ? ns.reduce((t, j) => t + (at[j] as number), 0) / ns.length : (at[i] as number);
    });
    // each as near its wish as the order and the gaps allow: pushed right, then pulled back left
    row.forEach((i, k) => (at[i] = want[k] as number));
    keepApart(row, 1);
    const shift = row.reduce((t, i, k) => t + (want[k] as number) - (at[i] as number), 0) / Math.max(1, row.length);
    for (const i of row) at[i] = (at[i] as number) + shift;
    keepApart(row, -1);
  };
  for (let s = 0; s < PULLS; s++) {
    if (s % 2 === 0) for (let r = 1; r < rowCount; r++) settle(byRow[r] as number[]);
    else for (let r = rowCount - 2; r >= 0; r--) settle(byRow[r] as number[]);
  }
  // down the rows: each row as deep as its deepest box, with room between
  const depth = new Float64Array(rowCount);
  for (let i = 0; i < n; i++) {
    const r = rows[i] as number;
    depth[r] = Math.max(depth[r] as number, sizeOf(i)[1 - across] as number);
  }
  const rowAt = new Float64Array(rowCount);
  let y = 0;
  for (let r = 0; r < rowCount; r++) {
    rowAt[r] = y + (depth[r] as number) / 2;
    y += (depth[r] as number) + rowGap;
  }
  let lo = Infinity;
  for (let i = 0; i < items.length; i++) lo = Math.min(lo, (at[i] as number) - (items[i] as Item).across / 2);
  const spot = (i: number): [number, number] => {
    const a = (at[i] as number) - lo,
      r = rowAt[(items[i] as Item).row] as number;
    return rankdir === 'LR' ? [r, a] : [a, r];
  };
  keys.forEach((k, i) => out.spots.set(k, spot(i)));
  // each link leaves its box toward the next row, crosses each row between in its lane, and comes into its box from
  // the row before. So it runs through the room between rows, never over a box. A link turned to run with the flow
  // takes the same way back
  const point = (r: number, a: number): [number, number] => (rankdir === 'LR' ? [r, a - lo] : [a - lo, r]);
  const edge = (r: number, side: 1 | -1) => (rowAt[r] as number) + (side * (depth[r] as number)) / 2;
  links.forEach((next, v) => {
    for (const w of next) {
      const chain = chainOf.get(`${v} ${w}`) ?? [];
      const points: [number, number][] = [point(edge(rows[v] as number, 1), at[v] as number)];
      for (const i of chain) {
        const r = (items[i] as Item).row;
        points.push(point(edge(r, -1), at[i] as number), point(edge(r, 1), at[i] as number));
      }
      points.push(point(edge(rows[w] as number, -1), at[w] as number));
      if (seen.has(`${v} ${w}`)) out.via.set(viaKey(keys[v] as string, keys[w] as string), points);
      if (seen.has(`${w} ${v}`)) out.via.set(viaKey(keys[w] as string, keys[v] as string), points.slice().reverse());
    }
  });
  return out;
}
