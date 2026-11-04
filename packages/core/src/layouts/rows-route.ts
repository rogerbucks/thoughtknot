// Our own curve router (editor spec §25, links_routed_in_rows; #1232). Graphviz lays a drawing out in rows of boxes,
// and its own curves pass between them. Routing them is about a quarter of its work, and on fixed boxes its router took
// seconds. So a link is routed here on the rows Graphviz left, as fast published routers do. In each row it crosses,
// it runs straight through the nearest gap between two boxes. Between rows it bends as one smooth S. A link inside
// one row with boxes in its way loops out into the room beside the row. Links through one gap share it, side by side,
// in the order they come from, so they do not cross there. The bends are drawn as a curve by routed-curve.ts.
// Host-free and pure.
import type { Placed } from '../direct-curve.ts';
import type { DrawMark } from '../drawing-marks.ts';
import type { MarkPoint } from '../plugin-diagrams.ts';
import { SCREEN } from './folded-rows.ts';

/** The room kept between a link and a box it passes, in pixels. */
export const ROW_CLEAR = 6;
/** The room kept between links sharing a gap that has room to spare, in pixels. */
const LANE = 6;
/** How far a link in the last row loops out past it, in pixels. */
const LOOP = 24;
/** The key of a trunk's dot (fold-source.ts): it is in no row. */
const TRUNK = 'trunk: ';

/** One row of boxes: where it runs along the drawing's way, and its boxes' spans across it, in order. */
interface Row {
  at: number;
  lo: number;
  hi: number;
  spans: [number, number][];
}

/** A place a link passes through a row: which row, which gap, and where across it would like to be. */
interface Pass {
  link: number;
  row: number;
  gap: number;
  want: number;
  /** The points of the link's bends that sit in this gap, to move together. */
  points: MarkPoint[];
}

/** The rows of `boxes` along `axis` (0 across, 1 down): boxes whose middles line up, as Graphviz puts a row. */
export function rowsOf(boxes: readonly Placed[], axis: 0 | 1): Row[] {
  const byAt = new Map<number, Placed[]>();
  for (const b of boxes) {
    if (b.key.startsWith(TRUNK)) continue;
    const at = Math.round(axis === 0 ? b.x : b.y);
    const row = byAt.get(at);
    if (row) row.push(b);
    else byAt.set(at, [b]);
  }
  return [...byAt]
    .sort(([p], [q]) => p - q)
    .map(([at, bs]) => {
      const half = Math.max(...bs.map((b) => (axis === 0 ? b.hw : b.hh)));
      const spans = bs
        .map((b): [number, number] => (axis === 0 ? [b.y - b.hh, b.y + b.hh] : [b.x - b.hw, b.x + b.hw]))
        .sort((p, q) => p[0] - q[0]);
      return { at, lo: at - half, hi: at + half, spans };
    });
}

/** Whether `boxes` are laid out in rows along `axis`: most boxes share their row with another. */
export function inRows(boxes: readonly Placed[], axis: 0 | 1): boolean {
  const rows = rowsOf(boxes, axis);
  return boxes.length > 2 && rows.length > 1 && rows.length * 2 <= boxes.length;
}

/** The thing boxes of `marks`, each once, by its middle and half its size. */
function thingBoxes(marks: readonly DrawMark[]): Placed[] {
  const boxes = new Map<string, Placed>();
  for (const m of marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined && !boxes.has(m.of))
      boxes.set(m.of, { key: m.of, x: m.x + m.width / 2, y: m.y + m.height / 2, hw: m.width / 2, hh: m.height / 2 });
  return [...boxes.values()];
}

/** Whether the thing boxes of `marks` are laid out in rows along `axis`, as `inRows` says. */
export function marksInRows(marks: readonly DrawMark[], axis: 0 | 1): boolean {
  return inRows(thingBoxes(marks), axis);
}

/** The room between two runs of rows wrapped beside each other, in pixels. */
const WRAP_GAP = 48;

/** `rows` cut into runs of about the same length along the way, about `n` of them, in order. */
function runsOf(rows: readonly Row[], n: number): Row[][] {
  const share = ((rows[rows.length - 1] as Row).hi - (rows[0] as Row).lo) / n;
  const runs: Row[][] = [];
  let run: Row[] = [];
  for (const r of rows) {
    if (run.length && r.hi - (run[0] as Row).lo > share) runs.push(run.splice(0));
    run.push(r);
  }
  return [...runs, run];
}

/** Where each thing box goes once its rows are wrapped, and the drawing's new size. */
export interface Wrapped {
  at: Map<string, [number, number]>;
  width: number;
  height: number;
}

/** A strip of rows no longer than this, in pixels, is read at Fit as it is: it is never wrapped. */
const WRAP_LONGER = 1600;
/** The room between two boxes of one row once its boxes are stacked close, in pixels. */
const STACK_GAP = 16;

/** Each box of `boxes` in its row along `axis`, the rows in order, each row's boxes in order across. */
function rowBoxes(boxes: readonly Placed[], axis: 0 | 1): Placed[][] {
  const byAt = new Map<number, Placed[]>();
  for (const b of boxes) {
    if (b.key.startsWith(TRUNK)) continue;
    const at = Math.round(axis === 0 ? b.x : b.y);
    byAt.set(at, [...(byAt.get(at) ?? []), b]);
  }
  const across = (b: Placed) => (axis === 0 ? b.y : b.x);
  return [...byAt].sort(([p], [q]) => p - q).map(([, bs]) => bs.sort((p, q) => across(p) - across(q)));
}

/**
 * The thing boxes of `marks` with their rows wrapped (timeline_wraps_days). Rows run along `axis`, as a timeline's
 * days do. Each row's boxes are stacked close, in their order. A strip far longer than a screen's shape is then cut
 * into runs of rows, in order. Each run goes under the one before, or beside it for rows down. So the days still read
 * in order, first to last, and the drawing comes near a screen's shape. Undefined for a short or screen-shaped drawing.
 */
export function wrappedRows(marks: readonly DrawMark[], axis: 0 | 1): Wrapped | undefined {
  const rows = rowBoxes(thingBoxes(marks), axis);
  if (rows.length < 2) return undefined;
  const half = (b: Placed): [number, number] => (axis === 0 ? [b.hw, b.hh] : [b.hh, b.hw]);
  const mid = (b: Placed): [number, number] => (axis === 0 ? [b.x, b.y] : [b.y, b.x]);
  const all = rows.flat(),
    top = Math.min(...all.map((b) => mid(b)[1] - half(b)[1])),
    lo = (r: Placed[]) => Math.min(...r.map((b) => mid(b)[0] - half(b)[0])),
    hi = (r: Placed[]) => Math.max(...r.map((b) => mid(b)[0] + half(b)[0]));
  // each row's boxes stacked close from the top, in their order: the middle across of each
  const stacked = new Map<string, number>();
  let deep = 0;
  for (const r of rows) {
    let y = top;
    for (const b of r) {
      stacked.set(b.key, y + half(b)[1]);
      y += 2 * half(b)[1] + STACK_GAP;
    }
    deep = Math.max(deep, y - STACK_GAP - top);
  }
  const start = lo(rows[0] as Placed[]);
  const spans: Row[] = rows.map((r) => ({ at: mid(r[0] as Placed)[0], lo: lo(r), hi: hi(r), spans: [] }));
  const sizeOf = (runs: readonly Row[][]): [number, number] => [
    Math.max(...runs.map((r) => (r[r.length - 1] as Row).hi - (r[0] as Row).lo)) + 2 * start,
    runs.length * deep + (runs.length - 1) * WRAP_GAP + 2 * top,
  ];
  const off = (runs: readonly Row[][]) => {
    const [l, a] = sizeOf(runs);
    return Math.abs(Math.log((axis === 0 ? l / a : a / l) / SCREEN));
  };
  let best: Row[][] = [spans];
  if (sizeOf(best)[0] <= WRAP_LONGER || off(best) <= Math.log(2)) return undefined;
  for (let n = 2; n <= spans.length; n++) {
    const runs = runsOf(spans, n);
    if (off(runs) < off(best)) best = runs;
  }
  const shift = new Map<Row, [number, number]>();
  best.forEach((run, i) => {
    for (const r of run) shift.set(r, [start - (run[0] as Row).lo, i * (deep + WRAP_GAP)]);
  });
  const at = new Map<string, [number, number]>();
  rows.forEach((r, i) => {
    const [l, a] = shift.get(spans[i] as Row) ?? [0, 0];
    for (const b of r) {
      const p: [number, number] = [mid(b)[0] + l, (stacked.get(b.key) ?? mid(b)[1]) + a];
      at.set(b.key, axis === 0 ? p : [p[1], p[0]]);
    }
  });
  const [l, a] = sizeOf(best);
  return { at, ...(axis === 0 ? { width: l, height: a } : { width: a, height: l }) };
}

/** The first span of `spans` that ends past `v`: the gap before it is gap `i`, the room after the last is gap length. */
function gapAt(spans: readonly [number, number][], v: number): number {
  let lo = 0,
    hi = spans.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if ((spans[m] as [number, number])[1] + ROW_CLEAR <= v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The room across of gap `i` of `spans`: from the end of the span before it to the start of the span after. */
function roomOf(spans: readonly [number, number][], i: number): [number, number] {
  return [(spans[i - 1]?.[1] ?? -Infinity) + ROW_CLEAR, (spans[i]?.[0] ?? Infinity) - ROW_CLEAR];
}

/** The gap of `spans` nearest `v`, and where in it `v` is best: `v` itself where it is free. */
function nearestGap(spans: readonly [number, number][], v: number): [number, number] {
  const i = gapAt(spans, v);
  const [lo, hi] = roomOf(spans, i);
  if (v >= lo && v <= hi) return [i, v];
  // inside span i: the gap before it or the one after, whichever is nearer
  const span = spans[i] as [number, number];
  const before = span[0] - ROW_CLEAR,
    after = span[1] + ROW_CLEAR;
  const [gb, ga] = [roomOf(spans, i), roomOf(spans, i + 1)];
  const at = (g: [number, number], p: number) => (g[0] > g[1] ? (g[0] + g[1]) / 2 : p);
  return v - before <= after - v ? [i, at(gb, before)] : [i + 1, at(ga, after)];
}

/** The point at `along` the drawing's way and `across` it, along `axis`. */
const pointOf = (axis: 0 | 1, along: number, across: number): MarkPoint =>
  axis === 0 ? [along, across] : [across, along];

/**
 * The bends of each of `links`, in the order given, routed on the rows of `boxes` along `axis`. A link with nothing in
 * its way has none. Each bend is a point a link passes, drawn through as one smooth curve (routed-curve.ts).
 */
export function rowsRoute(
  boxes: readonly Placed[],
  links: readonly (readonly [Placed, Placed])[],
  axis: 0 | 1,
): MarkPoint[][] {
  const rows = rowsOf(boxes, axis);
  const alongOf = (b: Placed) => (axis === 0 ? b.x : b.y),
    acrossOf = (b: Placed) => (axis === 0 ? b.y : b.x),
    halfOf = (b: Placed) => (axis === 0 ? b.hw : b.hh);
  const passes: Pass[] = [];
  const out = links.map(([a, b], link): MarkPoint[] => {
    const ua = alongOf(a),
      ub = alongOf(b),
      va = acrossOf(a),
      vb = acrossOf(b);
    const rowA = rows.findIndex((r) => ua >= r.lo && ua <= r.hi);
    // one row: a link with a box between its ends loops out into the room beside the row
    if (rowA >= 0 && ub >= (rows[rowA] as Row).lo && ub <= (rows[rowA] as Row).hi) {
      const row = rows[rowA] as Row;
      const [v0, v1] = va < vb ? [va, vb] : [vb, va];
      const between = row.spans.some(([s0, s1]) => s0 > v0 + 1 && s1 < v1 - 1);
      if (!between) return [];
      const next = rows[rowA + 1],
        before = rows[rowA - 1];
      const outward = next !== undefined || before === undefined;
      const edge = outward ? row.hi : row.lo,
        room = outward ? (next ? (next.lo - row.hi) / 2 : LOOP) : (row.lo - before.hi) / 2;
      const loop = edge + (outward ? room : -room);
      return [pointOf(axis, edge, va), pointOf(axis, loop, (va + vb) / 2), pointOf(axis, edge, vb)];
    }
    // across rows: out of the end's own row at its middle, through a gap in each row between, into the other's row
    const way = ub >= ua ? 1 : -1;
    const path: MarkPoint[] = [];
    let u = ua,
      v = va;
    const leave = rowA >= 0 ? rows[rowA] : undefined;
    if (leave) {
      const edge = way > 0 ? leave.hi : leave.lo;
      if (Math.abs(edge - (ua + way * halfOf(a))) > 1) path.push(pointOf(axis, edge, va));
      u = edge;
    }
    const rowB = rows.findIndex((r) => ub >= r.lo && ub <= r.hi);
    const enter = rowB >= 0 ? rows[rowB] : undefined;
    const endU = enter ? (way > 0 ? enter.lo : enter.hi) : ub;
    const between = rows
      .map((r, i) => [r, i] as const)
      .filter(([r, i]) => i !== rowA && i !== rowB && (way > 0 ? r.lo > u && r.hi < endU : r.hi < u && r.lo > endU));
    if (way < 0) between.reverse();
    for (const [r, i] of between) {
      const [first, last] = way > 0 ? [r.lo, r.hi] : [r.hi, r.lo];
      // where a line on toward the far end would cross this row, moved to the nearest gap
      const t = (first - u) / (endU - u || 1);
      const want = v + (vb - v) * t;
      const [gap, at] = nearestGap(r.spans, want);
      const points = [pointOf(axis, first, at), pointOf(axis, last, at)];
      path.push(...points);
      passes.push({ link, row: i, gap, want, points });
      u = last;
      v = at;
    }
    if (enter && Math.abs(endU - (ub - way * halfOf(b))) > 1) path.push(pointOf(axis, endU, vb));
    // nothing between: still one S through the room between the rows, never a slant across a row
    if (!path.length) path.push(pointOf(axis, (u + endU) / 2, (va + vb) / 2));
    return path;
  });
  spreadLanes(rows, passes, axis);
  return out;
}

/** Links through one gap moved apart across it, in the order they would like to be, so none crosses another there. */
function spreadLanes(rows: readonly Row[], passes: readonly Pass[], axis: 0 | 1): void {
  const byGap = new Map<string, Pass[]>();
  for (const p of passes) {
    const key = `${p.row}:${p.gap}`;
    const list = byGap.get(key);
    if (list) list.push(p);
    else byGap.set(key, [p]);
  }
  const across = axis === 0 ? 1 : 0;
  for (const [key, list] of byGap) {
    if (list.length < 2) continue;
    const [row, gap] = key.split(':').map(Number) as [number, number];
    const [lo, hi] = roomOf((rows[row] as Row).spans, gap);
    list.sort((p, q) => p.want - q.want || p.link - q.link);
    const wanted = list.map((p) => (p.points[0] as MarkPoint)[across]);
    let sum = 0;
    for (const w of wanted) sum += w;
    const mid = sum / wanted.length;
    // side by side, LANE apart, round where they would like to be, kept inside the gap; squeezed to fit a narrow one
    const width = Math.min(LANE * (list.length - 1), Math.max(0, hi - lo));
    const step = list.length > 1 ? width / (list.length - 1) : 0;
    // a gap too narrow for its margins has them cross: its middle, as nearestGap gives it, not its far edge
    const start = hi < lo ? (lo + hi) / 2 : Math.min(Math.max(mid - width / 2, lo), hi - width);
    list.forEach((p, k) => {
      const at = start + step * k;
      for (const point of p.points) point[across] = at;
    });
  }
}
