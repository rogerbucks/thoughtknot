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

/** A box's size, in CSS pixels. */
export type Size = readonly [number, number];

/** The room between two boxes in one row, and between two rows, in CSS pixels. */
const GAP = 18;
const ROW_GAP = 56;
/** Sweeps of ordering rows by their neighbours, and rounds of pulling things across. */
const SWEEPS = 8;
const PULLS = 12;
/** The shape a drawing is aimed at: this many wide to one high, about a screen's. */
const ASPECT = 1.6;

/** One thing or stand-in to place: its row, its size across the rows, and its neighbours in the rows either side. */
interface Item {
  row: number;
  across: number;
  up: number[];
  down: number[];
  /** A stand-in's link: the things at its two ends. */
  ends?: readonly [number, number];
}

/**
 * Each thing's row, by index. `out` is each thing's links, and is given back with the links that ran back turned round.
 */
function rowsOf(n: number, out: number[][]): number[] {
  // turn round the links that run back: a link to a thing still being searched from is one
  const state = new Uint8Array(n);
  const forward: number[][] = out.map(() => []);
  const visit = (start: number) => {
    const stack: [number, number][] = [[start, 0]];
    state[start] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1] as [number, number];
      const [v, k] = top;
      const next = out[v] ?? [];
      if (k >= next.length) {
        state[v] = 2;
        stack.pop();
        continue;
      }
      top[1] = k + 1;
      const w = next[k] as number;
      if (state[w] === 1) (forward[w] as number[]).push(v);
      else {
        (forward[v] as number[]).push(w);
        if (state[w] === 0) {
          state[w] = 1;
          stack.push([w, 0]);
        }
      }
    }
  };
  const into = new Int32Array(n);
  for (const next of out) for (const w of next) into[w] = (into[w] as number) + 1;
  for (let v = 0; v < n; v++) if (!into[v] && !state[v]) visit(v);
  for (let v = 0; v < n; v++) if (!state[v]) visit(v);
  // longest path: each thing a row after the latest thing that links to it
  const indeg = new Int32Array(n);
  for (const next of forward) for (const w of next) indeg[w] = (indeg[w] as number) + 1;
  const row = new Int32Array(n);
  const queue: number[] = [];
  for (let v = 0; v < n; v++) if (!indeg[v]) queue.push(v);
  for (let h = 0; h < queue.length; h++) {
    const v = queue[h] as number;
    for (const w of forward[v] ?? []) {
      row[w] = Math.max(row[w] as number, (row[v] as number) + 1);
      indeg[w] = (indeg[w] as number) - 1;
      if (!indeg[w]) queue.push(w);
    }
  }
  // a start sits just before the nearest thing it links to, so its links do not run the length of the drawing
  const fed = new Uint8Array(n);
  for (const next of forward) for (const w of next) fed[w] = 1;
  for (let v = 0; v < n; v++) {
    const next = forward[v] ?? [];
    if (!fed[v] && next.length) row[v] = Math.min(...next.map((w) => row[w] as number)) - 1;
  }
  out.splice(0, out.length, ...forward);
  return Array.from(row);
}

/**
 * Rows too long for the drawing's shape, split into several, so a shallow graph is not one long strip. A drawing is
 * aimed at `ASPECT` wide to one high. Each long row is cut in order of where its things' sources sit, and the rows
 * after it move along.
 */
function wrapped(rows: number[], links: readonly number[][], sizeOf: (i: number) => Size, across: number): number[] {
  const count = Math.max(...rows) + 1;
  let area = 0;
  const length = new Float64Array(count);
  rows.forEach((r, i) => {
    const s = sizeOf(i);
    area += (s[0] + GAP) * (s[1] + ROW_GAP);
    length[r] = (length[r] as number) + (s[across] as number) + GAP;
  });
  // rows left to right are columns, so their length runs down the drawing
  const most = across === 1 ? Math.sqrt(area / ASPECT) : Math.sqrt(area * ASPECT);
  const parts = Array.from(length, (l) => Math.max(1, Math.ceil(l / most)));
  if (parts.every((p) => p === 1)) return rows;
  const firstSource = new Float64Array(rows.length).fill(Infinity);
  links.forEach((next, v) => {
    for (const w of next) firstSource[w] = Math.min(firstSource[w] as number, v);
  });
  const start = new Int32Array(count);
  for (let r = 1; r < count; r++) start[r] = (start[r - 1] as number) + (parts[r - 1] as number);
  const out = rows.slice();
  for (let r = 0; r < count; r++) {
    const members = rows.flatMap((row, i) => (row === r ? [i] : []));
    members.sort((p, q) => (firstSource[p] as number) - (firstSource[q] as number) || p - q);
    const each = Math.ceil(members.length / (parts[r] as number));
    members.forEach((i, k) => (out[i] = (start[r] as number) + Math.floor(k / each)));
  }
  return out;
}

/**
 * Each thing of `shape` placed in rows, its middle in CSS pixels. `sizes` gives each box's width and height (absent:
 * 120 by 40). `rankdir` is `LR` (rows left to right) or `TB` (top to bottom). `previous` orders the rows as last time.
 */
export function layeredLayout(
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size> = new Map(),
  rankdir: 'LR' | 'TB' = 'LR',
  previous?: ReadonlyMap<string, readonly number[]>,
): Map<string, [number, number]> {
  const keys = shape.things.map((t) => t.key);
  const n = keys.length;
  const out = new Map<string, [number, number]>();
  if (!n) return out;
  const index = new Map(keys.map((k, i) => [k, i]));
  const across = rankdir === 'LR' ? 1 : 0; // which size runs across a row
  const sizeOf = (i: number): Size => sizes.get(keys[i] as string) ?? [120, 40];
  const links: number[][] = keys.map(() => []);
  const seen = new Set<string>();
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a === undefined || b === undefined || a === b || seen.has(`${a} ${b}`)) continue;
    seen.add(`${a} ${b}`);
    (links[a] as number[]).push(b);
  }
  const rows = wrapped(rowsOf(n, links), links, (i) => sizeOf(i), across);
  // the items: things, then a stand-in in each row a link skips
  const items: Item[] = keys.map((_, i) => ({ row: rows[i] as number, across: sizeOf(i)[across], up: [], down: [] }));
  links.forEach((next, v) => {
    for (const w of next) {
      let from = v;
      for (let r = (rows[v] as number) + 1; r < (rows[w] as number); r++) {
        items.push({ row: r, across: 0, up: [from], down: [], ends: [v, w] });
        (items[from] as Item).down.push(items.length - 1);
        from = items.length - 1;
      }
      (items[w] as Item).up.push(from);
      (items[from] as Item).down.push(w);
    }
  });
  const rowCount = Math.max(...rows) + 1;
  const byRow: number[][] = Array.from({ length: rowCount }, () => []);
  items.forEach((it, i) => (byRow[it.row] as number[]).push(i));
  // start in last time's order where there is one, else in the shape's order
  const was = (i: number) => {
    const p = i < n ? previous?.get(keys[i] as string) : undefined;
    return p ? (p[across] ?? 0) : Infinity;
  };
  for (const row of byRow) row.sort((p, q) => was(p) - was(q) || p - q);
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
  for (const row of byRow) row.forEach((i, k) => (place[i] = k));
  for (let s = 0; s < SWEEPS; s++) {
    if (s % 2 === 0) for (let r = 1; r < rowCount; r++) reorder(byRow[r] as number[], 'up');
    else for (let r = rowCount - 2; r >= 0; r--) reorder(byRow[r] as number[], 'down');
  }
  // across: packed in order, then pulled toward neighbours, kept in order and apart. Stand-ins take no room: they
  // only keep the order, so a row is as long as its boxes, however many links pass through it.
  const at = new Float64Array(items.length);
  const gapOf = (p: number, i: number) => ((items[p] as Item).across + (items[i] as Item).across) / 2 + GAP;
  // each kept at or past the one before it, and a box past the box before it by the gap; `way` -1 runs leftward
  const keepApart = (row: number[], way: 1 | -1) => {
    let box = -1;
    for (let o = 0; o < row.length; o++) {
      const k = way === 1 ? o : row.length - 1 - o;
      const i = row[k] as number;
      const before = o ? (row[k - way] as number) : -1;
      let bound = before < 0 ? way * -Infinity : (at[before] as number);
      if (i < n && box >= 0)
        bound =
          way === 1
            ? Math.max(bound, (at[box] as number) + gapOf(box, i))
            : Math.min(bound, (at[box] as number) - gapOf(box, i));
      if (way * ((at[i] as number) - bound) < 0) at[i] = bound;
      if (i < n) box = i;
    }
  };
  for (const row of byRow) {
    let x = 0;
    for (const i of row) {
      const w = (items[i] as Item).across;
      at[i] = x + w / 2;
      if (w) x += w + GAP;
    }
  }
  const settle = (row: number[]) => {
    const want = row.map((i) => {
      const it = items[i] as Item;
      if (it.ends) {
        // a stand-in sits on the straight line between its link's two ends
        const [a, b] = it.ends;
        const ra = (items[a] as Item).row,
          rb = (items[b] as Item).row;
        return (at[a] as number) + (((at[b] as number) - (at[a] as number)) * (it.row - ra)) / (rb - ra);
      }
      // a thing goes toward the things it links to, past any stand-ins between
      const ns = [...it.up, ...it.down].map((j) => {
        const e = (items[j] as Item).ends;
        return e ? (e[0] === i ? e[1] : e[0]) : j;
      });
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
    y += (depth[r] as number) + ROW_GAP;
  }
  let lo = Infinity;
  for (let i = 0; i < n; i++) lo = Math.min(lo, (at[i] as number) - (items[i] as Item).across / 2);
  keys.forEach((k, i) => {
    const a = (at[i] as number) - lo,
      r = rowAt[rows[i] as number] as number;
    out.set(k, rankdir === 'LR' ? [r, a] : [a, r]);
  });
  return out;
}
