// How well a drawing reads and what it tells (editor spec §68, layout_readability_scored). Roger, 25 Oct 2026: "Not
// just readable but conveying useful information".
//
// Each score is a share from 0 to 1, read from the drawing's own marks, so Graphviz's drawing and ours are scored the
// same way. Higher is better for every one:
// - `clean`: links that cross no other link;
// - `clear`: links that pass over no box but their own two;
// - `flow`: links that run the drawing's way, left to right or down;
// - `near`: how short links are, against the spread of the drawing;
// - `kinds`: how much nearer things of one kind sit to each other than to the rest;
// - `hubs`: how far the things with most links sit nearer the middle than those with few.
// Host-free and pure.
import type { LaidMarks } from '../graphviz-marks.ts';

/** The scores of one drawing, each from 0 (worst) to 1 (best). */
export interface Readability {
  clean: number;
  clear: number;
  flow: number;
  near: number;
  kinds: number;
  hubs: number;
}

/** The most pairs of things sampled for the kinds score, so a large drawing is scored quickly. */
const PAIRS_MOST = 40_000;
/** The room of the grid that finds links and boxes near each other, in CSS pixels. */
const CELL = 128;

type Point = readonly [number, number];
interface Line {
  a: Point;
  b: Point;
  /** The points it is drawn through. */
  path: readonly Point[];
  from: string;
  to: string;
}

/** Whether segments p1 p2 and q1 q2 cross, not counting a touch at their ends. */
function crosses(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const side = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = side(q1, q2, p1),
    d2 = side(q1, q2, p2),
    d3 = side(p1, p2, q1),
    d4 = side(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Whether segment a b passes through the box of middle `m` and half size `h`, shrunk a little to forgive a graze. */
function through(a: Point, b: Point, m: Point, h: Point): boolean {
  const [hw, hh] = [h[0] * 0.9, h[1] * 0.9];
  let t0 = 0,
    t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]];
  for (let c = 0; c < 2; c++) {
    const lo = (m[c] as number) - (c ? hh : hw) - (a[c] as number),
      hi = (m[c] as number) + (c ? hh : hw) - (a[c] as number);
    const dc = d[c] as number;
    if (Math.abs(dc) < 1e-9) {
      if (lo > 0 || hi < 0) return false;
      continue;
    }
    let s0 = lo / dc,
      s1 = hi / dc;
    if (s0 > s1) [s0, s1] = [s1, s0];
    t0 = Math.max(t0, s0);
    t1 = Math.min(t1, s1);
    if (t0 > t1) return false;
  }
  return true;
}

/** Points along a cubic curve (a start, then three for each piece), eight to a piece, to check it as straight lines. */
function sampled(points: readonly Point[]): Point[] {
  const out: Point[] = points.length ? [points[0] as Point] : [];
  for (let i = 0; i + 3 < points.length; i += 3) {
    const [p0, p1, p2, p3] = [points[i], points[i + 1], points[i + 2], points[i + 3]] as Point[];
    for (let s = 1; s <= 8; s++) {
      const t = s / 8,
        u = 1 - t;
      const at = (c: 0 | 1) =>
        u * u * u * (p0 as Point)[c] +
        3 * u * u * t * (p1 as Point)[c] +
        3 * u * t * t * (p2 as Point)[c] +
        t * t * t * (p3 as Point)[c];
      out.push([at(0), at(1)]);
    }
  }
  return out;
}

/** The grid cells a box from `lo` to `hi` covers. */
function cells(lo: Point, hi: Point): string[] {
  const out: string[] = [];
  for (let i = Math.floor(lo[0] / CELL); i <= Math.floor(hi[0] / CELL); i++)
    for (let j = Math.floor(lo[1] / CELL); j <= Math.floor(hi[1] / CELL); j++) out.push(`${i} ${j}`);
  return out;
}

/** Spearman's rank agreement of two lists, from -1 to 1. */
function rankAgreement(xs: readonly number[], ys: readonly number[]): number {
  const ranks = (vs: readonly number[]) => {
    const order = vs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Float64Array(vs.length);
    for (let k = 0; k < order.length;) {
      let e = k;
      while (
        e + 1 < order.length &&
        (order[e + 1] as readonly [number, number])[0] === (order[k] as readonly [number, number])[0]
      )
        e++;
      for (let q = k; q <= e; q++) r[(order[q] as readonly [number, number])[1]] = (k + e) / 2;
      k = e + 1;
    }
    return r;
  };
  const rx = ranks(xs),
    ry = ranks(ys);
  const n = xs.length;
  const mean = (n - 1) / 2;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (rx[i] as number) - mean,
      dy = (ry[i] as number) - mean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * The scores of `laid`, drawn the way `rankdir` says. `kindOf` gives each thing's kind, for the kinds score; without
 * it every thing is one kind and the score is 1.
 */
export function readability(
  laid: LaidMarks,
  rankdir: 'LR' | 'TB' = 'LR',
  kindOf: ReadonlyMap<string, string> = new Map(),
): Readability {
  const boxes = new Map<string, { m: Point; h: Point }>();
  for (const k of laid.marks)
    if (k.kind === 'box' && k.role === 'thing' && k.of !== undefined && !boxes.has(k.of))
      boxes.set(k.of, { m: [k.x + k.width / 2, k.y + k.height / 2], h: [k.width / 2, k.height / 2] });
  const lines: Line[] = [];
  for (const k of laid.marks)
    if (k.kind === 'link' && k.from && k.to && k.from !== k.to && boxes.has(k.from) && boxes.has(k.to))
      lines.push({
        a: (boxes.get(k.from) as { m: Point }).m,
        b: (boxes.get(k.to) as { m: Point }).m,
        path: k.curve ? sampled(k.points) : k.points,
        from: k.from,
        to: k.to,
      });
  const keys = [...boxes.keys()];
  if (!lines.length || keys.length < 2) return { clean: 1, clear: 1, flow: 1, near: 1, kinds: 1, hubs: 1 };
  // each link as the pieces it is drawn with: a curve by its points, near enough. Each piece is filed by the grid
  // cells it covers, so it is checked only against those near it
  const pieces: { a: Point; b: Point; link: number }[] = [];
  lines.forEach((l, i) => {
    const path = l.path.length >= 2 ? l.path : [l.a, l.b];
    for (let k = 0; k + 1 < path.length; k++) pieces.push({ a: path[k] as Point, b: path[k + 1] as Point, link: i });
  });
  const boundsOf = (p: { a: Point; b: Point }): [Point, Point] => [
    [Math.min(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1])],
    [Math.max(p.a[0], p.b[0]), Math.max(p.a[1], p.b[1])],
  ];
  const byCell = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    for (const c of cells(...boundsOf(p))) (byCell.get(c) ?? byCell.set(c, []).get(c) ?? []).push(i);
  });
  const crossed = new Uint8Array(lines.length);
  for (const list of byCell.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const u = pieces[list[p] as number] as (typeof pieces)[number],
          v = pieces[list[q] as number] as (typeof pieces)[number];
        if (u.link === v.link || (crossed[u.link] && crossed[v.link])) continue;
        // links that share a box meet there; only links with four different ends can cross
        const a = lines[u.link] as Line,
          b = lines[v.link] as Line;
        if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
        if (crosses(u.a, u.b, v.a, v.b)) crossed[u.link] = crossed[v.link] = 1;
      }
  const boxCells = new Map<string, string[]>();
  for (const [k, { m, h }] of boxes)
    for (const c of cells([m[0] - h[0], m[1] - h[1]], [m[0] + h[0], m[1] + h[1]]))
      (boxCells.get(c) ?? boxCells.set(c, []).get(c) ?? []).push(k);
  const over = new Uint8Array(lines.length);
  for (const p of pieces) {
    if (over[p.link]) continue;
    const l = lines[p.link] as Line;
    const near = new Set<string>();
    for (const c of cells(...boundsOf(p))) for (const k of boxCells.get(c) ?? []) near.add(k);
    for (const k of near) {
      if (k === l.from || k === l.to) continue;
      const b = boxes.get(k) as { m: Point; h: Point };
      if (through(p.a, p.b, b.m, b.h)) {
        over[p.link] = 1;
        break;
      }
    }
  }
  const axis = rankdir === 'LR' ? 0 : 1;
  const forward = lines.filter((l) => l.b[axis] > l.a[axis] + 1).length;
  // near: the mean link length against the mean distance between any two things, sampled
  const random = (() => {
    let a = 2463534242;
    return () => ((a ^= a << 13), (a ^= a >>> 17), (a ^= a << 5), (a >>> 0) / 4294967296);
  })();
  const pairs = Math.min(PAIRS_MOST, (keys.length * (keys.length - 1)) / 2);
  let all = 0,
    same = 0,
    sameCount = 0;
  const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  for (let s = 0; s < pairs; s++) {
    const i = Math.floor(random() * keys.length);
    let j = Math.floor(random() * (keys.length - 1));
    if (j >= i) j++;
    const ki = keys[i] as string,
      kj = keys[j] as string;
    const d = dist((boxes.get(ki) as { m: Point }).m, (boxes.get(kj) as { m: Point }).m);
    all += d;
    if ((kindOf.get(ki) ?? '') === (kindOf.get(kj) ?? '')) {
      same += d;
      sameCount++;
    }
  }
  const meanAll = all / pairs;
  const linkMean = lines.reduce((t, l) => t + dist(l.a, l.b), 0) / lines.length;
  const kinds = sameCount ? Math.max(0, Math.min(1, 1 - same / sameCount / meanAll + 0.5)) : 1;
  // hubs: more links, nearer the middle of the drawing
  const degree = new Map(keys.map((k) => [k, 0]));
  for (const l of lines) {
    degree.set(l.from, (degree.get(l.from) as number) + 1);
    degree.set(l.to, (degree.get(l.to) as number) + 1);
  }
  const mid: Point = [
    keys.reduce((t, k) => t + (boxes.get(k) as { m: Point }).m[0], 0) / keys.length,
    keys.reduce((t, k) => t + (boxes.get(k) as { m: Point }).m[1], 0) / keys.length,
  ];
  const hubs = rankAgreement(
    keys.map((k) => degree.get(k) as number),
    keys.map((k) => -dist((boxes.get(k) as { m: Point }).m, mid)),
  );
  return {
    clean: 1 - crossed.reduce((t, v) => t + v, 0) / lines.length,
    clear: 1 - over.reduce((t, v) => t + v, 0) / lines.length,
    flow: forward / lines.length,
    near: Math.max(0, 1 - linkMean / meanAll),
    kinds,
    hubs: (hubs + 1) / 2,
  };
}
