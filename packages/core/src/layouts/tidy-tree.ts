// The tidy tree of our own engine (editor spec §68, layout_tidy_tree). Roger chose it, 28 Oct 2026: a part that is a
// tree is drawn as one, exactly and fast. Each thing sits one row after its parent. Each subtree takes a span of its
// own, so no two links cross. A parent sits at the middle of its children. Children keep the order their links were
// written in. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { viaKey } from './layered.ts';
import type { Layered, Size } from './layered.ts';
import { layoutOptions } from './layout-options.ts';
import type { LayoutOptions } from './layout-options.ts';

/** The room between two boxes in one row, and between two rows, in CSS pixels: as the layered layout keeps. */
const GAP = 18;
const ROW_GAP = 56;

/** Each thing's children, by key, where `shape` is a tree or a forest: no thing has two parents, and there is no loop. */
export function childrenOf(shape: GraphShape): Map<string, string[]> | undefined {
  const keys = new Set(shape.things.map((t) => t.key));
  const children = new Map(shape.things.map((t) => [t.key, [] as string[]]));
  const parent = new Map<string, string>();
  for (const l of shape.links) {
    if (l.from === l.to || !keys.has(l.from) || !keys.has(l.to)) continue;
    if (parent.has(l.to)) return undefined;
    parent.set(l.to, l.from);
    (children.get(l.from) as string[]).push(l.to);
  }
  // a loop leaves things no search from a root reaches
  let reached = 0;
  const stack = shape.things.filter((t) => !parent.has(t.key)).map((t) => t.key);
  while (stack.length) {
    reached++;
    stack.push(...(children.get(stack.pop() as string) as string[]));
  }
  return reached === keys.size ? children : undefined;
}

/**
 * `shape`, a tree or a forest, laid out tidily, its middles in CSS pixels; undefined for any other shape. Rows run
 * `rankdir`. `sizes` gives each box's width and height (absent: 120 by 40).
 */
export function tidyTree(
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size> = new Map(),
  rankdir: 'LR' | 'TB' = 'LR',
  options: Partial<LayoutOptions> = {},
): Layered | undefined {
  const children = childrenOf(shape);
  if (!children) return undefined;
  const { spacing, linkLength } = layoutOptions(options);
  const [gap, rowGap] = [GAP * spacing, ROW_GAP * linkLength];
  const along = rankdir === 'LR' ? 0 : 1,
    across = 1 - along;
  const sizeOf = (k: string): Size => sizes.get(k) ?? [120, 40];
  const hasParent = new Set([...children.values()].flat());
  const roots = shape.things.map((t) => t.key).filter((k) => !hasParent.has(k));
  // each subtree's span across the rows, found from the leaves up, and each thing's row
  const span = new Map<string, number>(),
    row = new Map<string, number>();
  const order: string[] = [];
  const stack = roots.map((k) => [k, 0] as [string, number]);
  while (stack.length) {
    const [k, r] = stack.pop() as [string, number];
    order.push(k);
    row.set(k, r);
    for (const c of children.get(k) as string[]) stack.push([c, r + 1]);
  }
  for (const k of order.reverse()) {
    const kids = children.get(k) as string[];
    const sum = kids.reduce((t, c) => t + (span.get(c) as number), 0) + gap * Math.max(0, kids.length - 1);
    span.set(k, Math.max(sizeOf(k)[across] as number, sum));
  }
  // each row as deep as its deepest box
  const depth: number[] = [];
  for (const [k, r] of row) depth[r] = Math.max(depth[r] ?? 0, sizeOf(k)[along]);
  const rowAt: number[] = [];
  depth.forEach(
    (d, r) => (rowAt[r] = r ? (rowAt[r - 1] as number) + ((depth[r - 1] as number) + d) / 2 + rowGap : d / 2),
  );
  // each subtree in its span, from the roots down, its root at the middle of its children
  const spots = new Map<string, [number, number]>();
  const place = (k: string, start: number) => {
    const kids = children.get(k) as string[];
    let at = start + ((span.get(k) as number) - kids.reduce((t, c) => t + (span.get(c) as number), 0)) / 2;
    at -= (gap * Math.max(0, kids.length - 1)) / 2;
    const middles: number[] = [];
    for (const c of kids) {
      place(c, at);
      middles.push((spots.get(c) as [number, number])[across] as number);
      at += (span.get(c) as number) + gap;
    }
    const middle = middles.length
      ? ((middles[0] as number) + (middles.at(-1) as number)) / 2
      : start + (span.get(k) as number) / 2;
    const spot: [number, number] = [0, 0];
    spot[along] = rowAt[row.get(k) as number] as number;
    spot[across] = middle;
    spots.set(k, spot);
  };
  let start = 0;
  for (const r of roots) {
    place(r, start);
    start += (span.get(r) as number) + gap;
  }
  // each link leaves its parent's row and comes into its child's row, as the layered rows draw it
  const via = new Map<string, [number, number][]>();
  const point = (k: string, side: 1 | -1): [number, number] => {
    const r = row.get(k) as number;
    const p: [number, number] = [0, 0];
    p[along] = (rowAt[r] as number) + (side * (depth[r] as number)) / 2;
    p[across] = (spots.get(k) as [number, number])[across] as number;
    return p;
  };
  for (const [k, kids] of children) for (const c of kids) via.set(viaKey(k, c), [point(k, 1), point(c, -1)]);
  return { spots, via };
}
