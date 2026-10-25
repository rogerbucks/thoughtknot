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
import { layeredLayout } from './layered.ts';
import type { Size } from './layered.ts';
import { stressLayout } from './stress.ts';

/** The layouts the engine picks from. */
export type OwnLayout = 'layered' | 'stress';

/** What the engine picked, and why, in a few words for a developer; a host says it from the catalogue. */
export interface Pick {
  layout: OwnLayout;
  why: 'flow' | 'tree' | 'network' | 'dense';
}

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
 * The layout for `shape`: rows for a flow or a tree, stress for the rest. A flow has few links per thing, and few
 * running back against it, found by a search from each start. A tree has about one link fewer than things.
 */
export function pickLayout(shape: GraphShape): Pick {
  const n = shape.things.length,
    m = shape.links.length;
  if (!n) return { layout: 'stress', why: 'network' };
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
export function apart(spots: Map<string, [number, number]>, sizes: ReadonlyMap<string, Size>): void {
  const keys = [...spots.keys()];
  for (let round = 0; round < APART_ROUNDS; round++) {
    let moved = 0;
    const sorted = keys
      .map((k) => {
        const [x, y] = spots.get(k) as [number, number];
        const [w, h] = sizes.get(k) ?? [0, 0];
        return { k, x, y, hw: w / 2 + APART / 2, hh: h / 2 + APART / 2 };
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
): { spots: Map<string, [number, number]>; pick: Pick } {
  const { shape, sizes } = marksShape(laid.marks);
  const pick = pickLayout(shape);
  let spots: Map<string, [number, number]>;
  if (pick.layout === 'layered') spots = layeredLayout(shape, sizes, rankdir, previous);
  else {
    // one link as long as a typical box is wide, plus room
    const ws = [...sizes.values()].map(([w, h]) => Math.hypot(w, h));
    const unit = (ws.reduce((t, w) => t + w, 0) / Math.max(1, ws.length)) * 0.75 + 30;
    const placed = stressLayout(shape, 2, previous, { unit });
    spots = new Map([...placed].map(([k, [x = 0, y = 0]]) => [k, [x, y] as [number, number]]));
    apart(spots, sizes);
  }
  // moved so the drawing starts at its top left, with a margin
  let x0 = Infinity,
    y0 = Infinity;
  for (const [k, [x, y]] of spots) {
    const [w, h] = sizes.get(k) ?? [0, 0];
    x0 = Math.min(x0, x - w / 2);
    y0 = Math.min(y0, y - h / 2);
  }
  for (const [k, [x, y]] of spots) spots.set(k, [x - x0 + MARGIN, y - y0 + MARGIN]);
  return { spots, pick };
}

/** The room round a drawing laid out by our own engine, in CSS pixels. */
export const MARGIN = 12;
