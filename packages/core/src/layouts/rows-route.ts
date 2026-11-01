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

/** Whether the thing boxes of `marks` are laid out in rows along `axis`, as `inRows` says. */
export function marksInRows(marks: readonly DrawMark[], axis: 0 | 1): boolean {
  const boxes = new Map<string, Placed>();
  for (const m of marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined && !boxes.has(m.of))
      boxes.set(m.of, { key: m.of, x: m.x + m.width / 2, y: m.y + m.height / 2, hw: m.width / 2, hh: m.height / 2 });
  return inRows([...boxes.values()], axis);
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
