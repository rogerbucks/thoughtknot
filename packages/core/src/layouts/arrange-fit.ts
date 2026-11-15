// The arrangement that fits some chosen things, worked out from their links (editor spec ES§45, board_arranged_by_graph).
// - No links between them: a grid. Links that make a tree: the tree, parents over their children.
// - Links that run one way but join up again: a flow, left to right in steps. Links that loop: a cluster, by force.
// The person is told which was chosen, and a layout they pick themselves is never replaced by this. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { FORCE_2D } from './layouts.ts';
import type { Layout, Spot } from './layouts.ts';

/** What the arrangement is called, for the words said and the layout chosen. */
export type Fit = 'grid' | 'tree' | 'flow' | 'cluster';

/** The links between distinct things of the shape, each once. */
function linksOf(shape: GraphShape): Map<string, string[]> {
  const keys = new Set(shape.things.map((t) => t.key));
  const out = new Map<string, string[]>(shape.things.map((t) => [t.key, []]));
  for (const l of shape.links) {
    const to = out.get(l.from);
    if (l.from !== l.to && keys.has(l.to) && to && !to.includes(l.to)) to.push(l.to);
  }
  return out;
}

/** The step of each thing, how far it is from where the links start, or none when the links loop. */
function steps(out: Map<string, string[]>): Map<string, number> | null {
  const into = new Map<string, number>([...out.keys()].map((k) => [k, 0]));
  for (const tos of out.values()) for (const t of tos) into.set(t, (into.get(t) ?? 0) + 1);
  const step = new Map<string, number>();
  const queue = [...out.keys()].filter((k) => !into.get(k));
  for (const k of queue) step.set(k, 0);
  while (queue.length) {
    const k = queue.shift() as string;
    for (const t of out.get(k) ?? []) {
      step.set(t, Math.max(step.get(t) ?? 0, (step.get(k) ?? 0) + 1));
      into.set(t, (into.get(t) ?? 1) - 1);
      if (!into.get(t)) queue.push(t);
    }
  }
  return step.size === out.size ? step : null;
}

/** Which arrangement fits the shape: by its links alone, so the same things always fit the same way. */
export function fitOf(shape: GraphShape): Fit {
  const out = linksOf(shape);
  if (![...out.values()].some((tos) => tos.length)) return 'grid';
  if (!steps(out)) return 'cluster';
  const into = new Map<string, number>();
  for (const tos of out.values()) for (const t of tos) into.set(t, (into.get(t) ?? 0) + 1);
  return [...into.values()].some((n) => n > 1) ? 'flow' : 'tree';
}

/** Things in rows, as square as they can be, in the order given. */
const grid: Layout<2> = {
  id: 'grid-fit',
  dims: 2,
  place: (shape) => {
    const cols = Math.ceil(Math.sqrt(shape.things.length));
    return new Map(shape.things.map((t, i): [string, Spot<2>] => [t.key, [i % cols, Math.floor(i / cols)]]));
  },
};

/** The things in steps: a step is a row (tree, down) or a column (flow, across), each thing in turn within its step. */
function layered(down: boolean): Layout<2>['place'] {
  return (shape) => {
    const out = linksOf(shape);
    const step = steps(out) ?? new Map<string, number>();
    const parents = new Map<string, string[]>();
    for (const [k, tos] of out) for (const t of tos) parents.set(t, [...(parents.get(t) ?? []), k]);
    const slot = new Map<string, number>();
    let next = 0;
    // a thing's slot is the middle of its children's, which are given slots first, so a parent stands over its own
    const give = (k: string): number => {
      const done = slot.get(k);
      if (done !== undefined) return done;
      const kids = (out.get(k) ?? []).filter((c) => (parents.get(c) ?? [])[0] === k);
      const at = kids.length ? kids.map(give).reduce((a, b) => a + b, 0) / kids.length : next++;
      slot.set(k, at);
      return at;
    };
    const roots = shape.things.map((t) => t.key).filter((k) => !parents.has(k));
    for (const k of roots) give(k);
    // what joins two paths has no one parent to stand under: it is given the next free slot, in step order
    for (const k of [...shape.things.map((t) => t.key)].sort((a, b) => (step.get(a) ?? 0) - (step.get(b) ?? 0)))
      if (!slot.has(k)) slot.set(k, next++);
    return new Map(
      shape.things.map((t): [string, Spot<2>] => {
        const s = step.get(t.key) ?? 0,
          at = slot.get(t.key) ?? 0;
        return [t.key, down ? [at, s] : [s, at]];
      }),
    );
  };
}

const tree: Layout<2> = { id: 'tree-fit', dims: 2, place: layered(true) };
const flow: Layout<2> = { id: 'flow-fit', dims: 2, place: layered(false) };

/** The layout that fits the shape, and its name. */
export function fittingLayout(shape: GraphShape): { how: Fit; layout: Layout<2> } {
  const how = fitOf(shape);
  return { how, layout: { grid, tree, flow, cluster: FORCE_2D }[how] };
}
