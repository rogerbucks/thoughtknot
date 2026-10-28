// The cheaper steps a slow layout falls back to, so a graph is never shown as text (editor spec §68, layout_never_text).
// Roger, 25 Oct 2026. When Graphviz runs out of time, our own engine lays the graph out. When that is slow too, it is
// laid out in rows with no ordering, then in a grid. Each step costs less than the one before. Rows and the grid each
// take one pass over the things and links, so neither can run out of time as a graph grows. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import type { Size } from './layered.ts';
import { SCREEN } from './folded-rows.ts';

/** A step down from Graphviz: our own engine, then rows with no ordering, then a grid. */
export type LayoutStep = 'own' | 'rows' | 'grid';

/** The steps in the order they are tried, each cheaper than the one before. */
export const LAYOUT_STEPS: readonly LayoutStep[] = ['own', 'rows', 'grid'];

/**
 * The step to lay a drawing out by when the way it was laid out ran out of time; undefined after the grid, the last.
 * A drawing Graphviz laid out goes to our own engine. One our own engine laid out goes to rows.
 */
export function nextStep(drawing: { engine?: 'own'; step?: LayoutStep }): LayoutStep | undefined {
  const at = drawing.step ? LAYOUT_STEPS.indexOf(drawing.step) : drawing.engine === 'own' ? 0 : -1;
  return LAYOUT_STEPS[at + 1];
}

/** The room between two boxes in a cheaper step, in CSS pixels, before the person's spacing. */
const GAP = 30;

/**
 * Each thing's middle, laid out by `step`, from `margin` at the top left, and the way its rows run. Rows: each thing a row past the nearest
 * thing that links to it, the first rows those nothing links to, in the order written. The grid: as many columns as
 * give a screen's shape, in the order written.
 */
export function cheaperSpots(
  step: 'rows' | 'grid',
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size>,
  rankdir: 'LR' | 'TB',
  spacing = 1,
  margin = 0,
): { spots: Map<string, [number, number]>; rankdir: 'LR' | 'TB' } {
  const keys = shape.things.map((t) => t.key);
  const gap = GAP * spacing;
  const rows = step === 'rows' ? rowsOf(keys, shape.links) : gridOf(keys, sizes, gap);
  const way = step === 'grid' ? 'TB' : rankdir; // a grid's rows run across, for its screen's shape
  const across = way === 'LR' ? 1 : 0; // the size along a row: a box's height in rows across, its width in rows down
  const spots = new Map<string, [number, number]>();
  let along = margin;
  for (const row of rows) {
    const deep = Math.max(...row.map((k) => (sizes.get(k) ?? [0, 0])[1 - across] as number));
    let at = margin;
    for (const k of row) {
      const size = sizes.get(k) ?? [0, 0];
      const wide = size[across];
      const mid = at + wide / 2;
      spots.set(k, way === 'LR' ? [along + deep / 2, mid] : [mid, along + deep / 2]);
      at += wide + gap;
    }
    along += deep + gap * 2;
  }
  return { spots, rankdir: way };
}

/** `keys` in rows by how far each is from a thing nothing links to, found in one pass; a loop starts where written. */
function rowsOf(keys: readonly string[], links: GraphShape['links']): string[][] {
  const out = new Map<string, string[]>();
  const linkedTo = new Set<string>();
  for (const l of links) {
    if (l.from === l.to) continue;
    (out.get(l.from) ?? out.set(l.from, []).get(l.from))?.push(l.to);
    linkedTo.add(l.to);
  }
  const row = new Map<string, number>();
  const walk = (starts: readonly string[]) => {
    const queue = starts.filter((k) => !row.has(k));
    for (const k of queue) row.set(k, 0);
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i] as string;
      for (const to of out.get(k) ?? [])
        if (!row.has(to)) {
          row.set(to, (row.get(k) as number) + 1);
          queue.push(to);
        }
    }
  };
  walk(keys.filter((k) => !linkedTo.has(k)));
  for (const k of keys) if (!row.has(k)) walk([k]);
  const rows: string[][] = [];
  for (const k of keys) (rows[row.get(k) as number] ??= []).push(k);
  return rows.filter(Boolean);
}

/** `keys` in rows of a grid, as many to a row as give a screen's shape for cells the size of a typical one. */
function gridOf(keys: readonly string[], sizes: ReadonlyMap<string, Size>, gap: number): string[][] {
  if (!keys.length) return [];
  let w = 0,
    h = 0;
  for (const k of keys) {
    const [a, b] = sizes.get(k) ?? [0, 0];
    [w, h] = [w + a, h + b];
  }
  // a cell is a box and the room after it: across, one gap; down, two, as rows are spaced
  const [cw, ch] = [w / keys.length + gap, h / keys.length + gap * 2];
  const columns = Math.max(1, Math.round(Math.sqrt((keys.length * SCREEN * ch) / Math.max(1, cw))));
  const rows: string[][] = [];
  for (let i = 0; i < keys.length; i += columns) rows.push(keys.slice(i, i + columns));
  return rows;
}
