// The layout picked for one part of a drawing (editor spec §53, layout_own_engine; §68, layout_pick_tried). A rule
// picks rows or stress by the part's shape. Near the rule's line, Roger chose on 28 Oct 2026, both are tried. The
// part is laid out both ways, and the one that reads better is kept. Each way is scored by its links that cross no
// other and pass over no box (readability.ts). Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import type { GraphShape } from '../types-shape.ts';
import { viaKey } from './layered.ts';
import type { Size } from './layered.ts';
import type { Placed } from './parts.ts';
import { readability } from './readability.ts';
import { placesMost } from './given.ts';

/** The layouts the engine picks from, and the spots a plug-in's layout gave (given.ts). */
export type OwnLayout = 'layered' | 'stress' | 'given';

/** What the engine picked, and why, in a few words for a developer; a host says it from the catalogue. */
export interface Pick {
  layout: OwnLayout;
  why: 'flow' | 'tree' | 'network' | 'dense' | 'overview' | 'tried' | 'chosen';
}

/**
 * The layout the person chose as `strategy` (§68, layout_plugins). It is undefined where the graph's shape picks. That
 * is when asked to, or when a plug-in's layout gave too few of `shape`'s things a spot.
 */
export function chosenPick(shape: GraphShape, strategy: string, placed?: ReadonlyMap<string, [number, number]>) {
  if (strategy === 'rows') return { layout: 'layered', why: 'chosen' } satisfies Pick;
  if (strategy === 'spread') return { layout: 'stress', why: 'chosen' } satisfies Pick;
  return strategy !== 'auto' && placesMost(shape, placed)
    ? ({ layout: 'given', why: 'chosen' } satisfies Pick)
    : undefined;
}

/** The key a folded group's box has (fold-source.ts). */
export const FOLDED_GROUP = 'group: ';
/** The share of links that may run back against the flow, for a graph still to be read as a flow. */
const BACK_MOST = 0.1;
/** The most links per thing, on average, for a graph still to be drawn in rows. */
const DENSE_MOST = 3;
/**
 * The layout for `shape`: rows for a flow, a tree or an overview, stress for the rest. A flow has few links per thing,
 * and few running back against it, found by a search from each start. A tree has about one link fewer than things. An
 * overview has groups folded, each one box.
 */
export function pickLayout(shape: GraphShape): Pick {
  const n = shape.things.length,
    m = shape.links.length;
  // for the tree rule, links count by the pair they join: two between the same things, or a loop, make no cycle
  const pairs = new Set(shape.links.filter((l) => l.from !== l.to).map((l) => [l.from, l.to].sort().join('\n'))).size;
  if (!n) return { layout: 'stress', why: 'network' };
  // with groups folded, each group is one box: the overview reads best in rows, its links kept off the boxes
  if (shape.things.some((t) => t.key.startsWith(FOLDED_GROUP))) return { layout: 'layered', why: 'overview' };
  if (pairs <= n - 1 + Math.ceil(n * 0.05)) return { layout: 'layered', why: 'tree' };
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

/** The most things in a part laid out both ways, so a large part costs one layout only. */
export const TRY_MOST = 200;
/** How much better the other layout must score to be kept, so a small change to a graph does not flip its layout. */
const BETTER_LEAST = 0.05;

/** How well `placed` reads: the share of `shape`'s links that cross no other, plus the share over no box but their own. */
export function tidiness(shape: GraphShape, sizes: ReadonlyMap<string, Size>, placed: Placed): number {
  const marks: DrawMark[] = [];
  for (const [key, [x, y]] of placed.spots) {
    const [width, height] = sizes.get(key) ?? [0, 0];
    marks.push({
      kind: 'box',
      id: key,
      style: 'thing',
      role: 'thing',
      of: key,
      x: x - width / 2,
      y: y - height / 2,
      width,
      height,
    });
  }
  for (const l of shape.links) {
    const a = placed.spots.get(l.from),
      b = placed.spots.get(l.to);
    if (!a || !b) continue;
    const points = [a, ...(placed.via.get(viaKey(l.from, l.to)) ?? []), b];
    marks.push({ kind: 'link', id: viaKey(l.from, l.to), style: 'link', from: l.from, to: l.to, points });
  }
  const { clean, clear } = readability({ marks, space: { width: 0, height: 0 } });
  return clean + clear;
}

/** Of `picked`, laid out by the rule, and `other`, the one that reads better; the rule's pick where both read alike. */
export function tidier<P extends Placed>(shape: GraphShape, sizes: ReadonlyMap<string, Size>, picked: P, other: P): P {
  return tidiness(shape, sizes, other) > tidiness(shape, sizes, picked) + BETTER_LEAST ? other : picked;
}
