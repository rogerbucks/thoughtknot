// Our own layout engine, for a drawing Graphviz has measured (editor spec §53, layout_own_engine). Roger, 25 Oct 2026:
// "we should have our own layout engine".
//
// Graphviz still measures each box and writes its words, but places nothing. It is run with every box at a stand-in
// spot (its `nop` engine), a fraction of the cost of a layout. Then the engine here:
// 1. reads the boxes, their sizes and the links from Graphviz's marks;
// 2. picks a layout by the graph's shape (`pickLayout`). A flow or a tree goes in rows (layered.ts). Anything else
//    is placed by stress (stress.ts);
// 3. pushes apart any boxes that still overlap;
// 4. hands the spots to the direct links (direct-links.ts), which move each box's marks there and draw its links.
// The rule and its reason are given back, so a host can say why a layout was picked. Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import type { LaidMarks } from '../graphviz-marks.ts';
import type { GraphShape } from '../types-shape.ts';
import { groupedLayered } from './grouped.ts';
import type { Group, GroupBox } from './grouped.ts';
import { RESTARTS, TRUNK_LINK, viaKey } from './layered.ts';
import type { Size } from './layered.ts';
import { layoutOptions } from './layout-options.ts';
import type { LayoutOptions } from './layout-options.ts';
import { stressLayout } from './stress.ts';

/** The layouts the engine picks from. */
export type OwnLayout = 'layered' | 'stress';

/** What the engine picked, and why, in a few words for a developer; a host says it from the catalogue. */
export interface Pick {
  layout: OwnLayout;
  why: 'flow' | 'tree' | 'network' | 'dense' | 'overview';
}

/** The key a folded group's box has (fold-source.ts). */
const FOLDED_GROUP = 'group: ';
/** The share of links that may run back against the flow, for a graph still to be read as a flow. */
const BACK_MOST = 0.1;
/** The most links per thing, on average, for a graph still to be drawn in rows. */
const DENSE_MOST = 3;
/** The room kept between two boxes pushed apart, in CSS pixels. */
const APART = 14;
/** The most rounds of pushing boxes apart. */
const APART_ROUNDS = 40;

/** The shape of a drawing as its marks give it: each box as a thing, each link between two boxes. */
export function marksShape(marks: readonly DrawMark[]): { shape: GraphShape; sizes: Map<string, Size> } {
  const sizes = new Map<string, Size>();
  const things: GraphShape['things'] = [];
  for (const m of marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined && !sizes.has(m.of)) {
      sizes.set(m.of, [m.width, m.height]);
      things.push({ key: m.of, text: m.name ?? m.of, kinds: [] });
    }
  const links: GraphShape['links'] = [];
  for (const m of marks)
    if (m.kind === 'link' && m.from !== undefined && m.to !== undefined && sizes.has(m.from) && sizes.has(m.to))
      links.push({ from: m.from, type: '', to: m.to });
  return { shape: { things, links }, sizes };
}

/**
 * The layout for `shape`: rows for a flow, a tree or an overview, stress for the rest. A flow has few links per thing,
 * and few running back against it, found by a search from each start. A tree has about one link fewer than things. An
 * overview has groups folded, each one box.
 */
export function pickLayout(shape: GraphShape): Pick {
  const n = shape.things.length,
    m = shape.links.length;
  if (!n) return { layout: 'stress', why: 'network' };
  // with groups folded, each group is one box: the overview reads best in rows, its links kept off the boxes
  if (shape.things.some((t) => t.key.startsWith(FOLDED_GROUP))) return { layout: 'layered', why: 'overview' };
  if (m <= n - 1 + Math.ceil(n * 0.05)) return { layout: 'layered', why: 'tree' };
  if (m / n > DENSE_MOST) return { layout: 'stress', why: 'dense' };
  return backShare(shape) <= BACK_MOST ? { layout: 'layered', why: 'flow' } : { layout: 'stress', why: 'network' };
}

/** The share of links that run back against the flow: to a thing still being searched from. */
function backShare(shape: GraphShape): number {
  const index = new Map(shape.things.map((t, i) => [t.key, i]));
  const out: number[][] = shape.things.map(() => []);
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a !== undefined && b !== undefined && a !== b) (out[a] as number[]).push(b);
  }
  const state = new Uint8Array(out.length);
  let back = 0,
    all = 0;
  for (let s = 0; s < out.length; s++) {
    if (state[s]) continue;
    const stack: [number, number][] = [[s, 0]];
    state[s] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1] as [number, number];
      const next = out[top[0]] as number[];
      if (top[1] >= next.length) {
        state[top[0]] = 2;
        stack.pop();
        continue;
      }
      const w = next[top[1]++] as number;
      all++;
      if (state[w] === 1) back++;
      else if (!state[w]) {
        state[w] = 1;
        stack.push([w, 0]);
      }
    }
  }
  return all ? back / all : 0;
}

/** Pushes apart boxes that overlap, by the shorter way, a few rounds, looking only at boxes near each other. */
export function apart(spots: Map<string, [number, number]>, sizes: ReadonlyMap<string, Size>, room = APART): void {
  const keys = [...spots.keys()];
  for (let round = 0; round < APART_ROUNDS; round++) {
    let moved = 0;
    const sorted = keys
      .map((k) => {
        const [x, y] = spots.get(k) as [number, number];
        const [w, h] = sizes.get(k) ?? [0, 0];
        return { k, x, y, hw: w / 2 + room / 2, hh: h / 2 + room / 2 };
      })
      .sort((p, q) => p.x - p.hw - (q.x - q.hw) || (p.k < q.k ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i] as (typeof sorted)[number];
      for (let j = i + 1; j < sorted.length; j++) {
        const q = sorted[j] as (typeof sorted)[number];
        if (q.x - q.hw >= p.x + p.hw) break;
        const ox = p.hw + q.hw - Math.abs(q.x - p.x),
          oy = p.hh + q.hh - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        if (oy <= ox) {
          const s = ((q.y >= p.y ? 1 : -1) * oy) / 2;
          p.y -= s;
          q.y += s;
        } else {
          const s = ((q.x >= p.x ? 1 : -1) * ox) / 2;
          p.x -= s;
          q.x += s;
        }
        moved++;
      }
    }
    for (const s of sorted) spots.set(s.k, [s.x, s.y]);
    if (!moved) break;
  }
}

/**
 * Each box of `laid` placed by our own engine, its middle in CSS pixels from the top left, with room round the edge.
 * `previous` is last time's spots, for a warm start. `rankdir` is the way rows run for a layered layout.
 */
export function ownSpots(
  laid: LaidMarks,
  rankdir: 'LR' | 'TB' = 'LR',
  previous?: ReadonlyMap<string, readonly number[]>,
  groups: readonly Group[] = [],
  options: Partial<LayoutOptions> = {},
): { spots: Map<string, [number, number]>; via: Map<string, [number, number][]>; boxes: GroupBox[]; pick: Pick } {
  const { shape: whole, sizes } = marksShape(laid.marks);
  const { spacing, linkLength } = layoutOptions(options);
  const { shape, trunks } = trunksOut(whole);
  const pick = pickLayout(shape);
  let spots: Map<string, [number, number]>;
  let via = new Map<string, [number, number][]>();
  let boxes: GroupBox[] = [];
  if (pick.layout === 'layered')
    ({ spots, via, boxes } = groupedLayered(
      shape,
      sizes,
      groups,
      rankdir,
      previous,
      options,
      pick.why === 'overview' && !previous ? RESTARTS : 0,
    ));
  else {
    // one link as long as a typical box is wide, plus room, as long again as `linkLength` asks
    const ws = [...sizes.values()].map(([w, h]) => Math.hypot(w, h));
    const unit = ((ws.reduce((t, w) => t + w, 0) / Math.max(1, ws.length)) * 0.75 + 30) * linkLength;
    const placed = stressLayout(shape, 2, previous, { unit });
    spots = new Map([...placed].map(([k, [x = 0, y = 0]]) => [k, [x, y] as [number, number]]));
    apart(spots, sizes, APART * spacing);
  }
  trunksBack(trunks, spots, via, rankdir === 'TB' ? 1 : 0);
  // moved so the drawing starts at its top left, with a margin
  let x0 = Infinity,
    y0 = Infinity;
  for (const [k, [x, y]] of spots) {
    const [w, h] = sizes.get(k) ?? [0, 0];
    x0 = Math.min(x0, x - w / 2);
    y0 = Math.min(y0, y - h / 2);
  }
  for (const b of boxes) [x0, y0] = [Math.min(x0, b.x - b.width / 2), Math.min(y0, b.y - b.height / 2)];
  const moved = ([x, y]: readonly [number, number]): [number, number] => [x - x0 + MARGIN, y - y0 + MARGIN];
  for (const [k, p] of spots) spots.set(k, moved(p));
  for (const [k, ps] of via) via.set(k, ps.map(moved));
  boxes = boxes.map((b) => {
    const [x, y] = moved([b.x, b.y]);
    return { ...b, x, y };
  });
  return { spots, via, boxes, pick };
}

/** A trunk's two points (fold-source.ts): where its links meet, and where they part. */
const TRUNK = /^trunk: (\d+) (in|out)$/;
/** How far along its one piece or lane a trunk's links meet, and how far from its end they part. */
const MEET = 0.4;
type Point = [number, number];

/** A trunk laid out as the one link it stands for: from the thing its links come from to the one they go to. */
interface Trunk {
  in: string;
  out: string;
  from: string;
  to: string;
}

/**
 * `shape` with each trunk that runs from one thing to one other taken out, and a link between those two in its place.
 * So the trunk is laid out as one link, not as two more things in rows of their own.
 */
function trunksOut(shape: GraphShape): { shape: GraphShape; trunks: Trunk[] } {
  const ends = new Map<string, { in: string; out: string; from: Set<string>; to: Set<string> }>();
  const endOf = (key: string) => {
    const m = TRUNK.exec(key);
    if (!m) return undefined;
    const t = m[1] as string;
    return (
      ends.get(t) ??
      ends
        .set(t, { in: key.replace(/out$/, 'in'), out: key.replace(/in$/, 'out'), from: new Set(), to: new Set() })
        .get(t)
    );
  };
  for (const l of shape.links) {
    const a = TRUNK.exec(l.from),
      b = TRUNK.exec(l.to);
    if (b?.[2] === 'in' && !a) endOf(l.to)?.from.add(l.from);
    if (a?.[2] === 'out' && !b) endOf(l.from)?.to.add(l.to);
  }
  const trunks: Trunk[] = [];
  for (const e of ends.values())
    if (e.from.size === 1 && e.to.size === 1) {
      const [from] = e.from,
        [to] = e.to;
      if (from !== to) trunks.push({ in: e.in, out: e.out, from: from as string, to: to as string });
    }
  if (!trunks.length) return { shape, trunks };
  const gone = new Set(trunks.flatMap((t) => [t.in, t.out]));
  return {
    shape: {
      things: shape.things.filter((t) => !gone.has(t.key)),
      links: [
        ...shape.links.filter((l) => !gone.has(l.from) && !gone.has(l.to)),
        ...trunks.map((t) => ({ from: t.from, type: TRUNK_LINK, to: t.to })),
      ],
    },
    trunks,
  };
}

/**
 * Each of `trunks` put back on the way its link was laid out. Its links meet in the first row it skips. They part in
 * the last, in the lane its link takes there. A trunk's link has lanes of its own (`TRUNK_LINK`). Between rows side
 * by side, they meet and part along the one piece. Each piece of the trunk takes its share of the way's bends.
 */
function trunksBack(
  trunks: readonly Trunk[],
  spots: Map<string, [number, number]>,
  via: Map<string, [number, number][]>,
  axis: 0 | 1,
): void {
  const lerp = (p: Point, q: Point, s: number): Point => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
  for (const t of trunks) {
    const a = spots.get(t.from),
      b = spots.get(t.to);
    if (!a || !b) continue;
    const way = via.get(viaKey(t.from, t.to)) ?? [];
    const path: Point[] = way.length >= 2 ? way : [a, b];
    const k = path.length - 1;
    if (k < 3) {
      spots.set(t.in, onPiece(path[0] as Point, path[k] as Point, MEET, axis));
      spots.set(t.out, onPiece(path[0] as Point, path[k] as Point, 1 - MEET, axis));
      if (way.length < 2) continue;
      via.set(viaKey(t.from, t.in), [path[0] as Point]);
      via.set(viaKey(t.out, t.to), [path[k] as Point]);
      continue;
    }
    // the lanes are the pieces from 1 to 2, from 3 to 4, and on; one lane alone holds both ends
    const one = k === 3;
    spots.set(t.in, lerp(path[1] as Point, path[2] as Point, one ? MEET : 0.5));
    spots.set(t.out, lerp(path[k - 2] as Point, path[k - 1] as Point, one ? 1 - MEET : 0.5));
    via.set(viaKey(t.from, t.in), [path[0] as Point, path[1] as Point]);
    via.set(viaKey(t.in, t.out), path.slice(2, k - 1));
    via.set(viaKey(t.out, t.to), [path[k - 1] as Point, path[k] as Point]);
  }
}

/** The room round a drawing laid out by our own engine, in CSS pixels. */
export const MARGIN = 12;

/**
 * The point a share `s` along the piece from `p` to `q`, drawn as routed-curve.ts draws it. It leaves and arrives
 * running the drawing's way (`axis` 0 across, 1 down).
 */
function onPiece(p: Point, q: Point, s: number, axis: 0 | 1): Point {
  const half = (q[axis] - p[axis]) / 2;
  const c1: Point = axis === 0 ? [p[0] + half, p[1]] : [p[0], p[1] + half];
  const c2: Point = axis === 0 ? [q[0] - half, q[1]] : [q[0], q[1] - half];
  const r = 1 - s;
  const at = (c: 0 | 1) => r * r * r * p[c] + 3 * r * r * s * c1[c] + 3 * r * s * s * c2[c] + s * s * s * q[c];
  return [at(0), at(1)];
}
