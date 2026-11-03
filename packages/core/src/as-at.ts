// A graph as it was on a chosen day (editor spec §60, discover_as_at). A time slider picks the day. It also picks
// which time it reads: when things were recorded, or when they held in the world (two_kinds_of_time). The graph is
// worked out from the one graph each time, and nothing is stored. It also lists the things that came or went since.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { compareSets } from './compare-sets.ts';

/** The kind of time a slider reads. */
export type Axis = 'recorded' | 'real';

/** The graph as at `date`, and what changed between then and `now`. */
export interface AsAtView {
  graph: Graph;
  /** The things in the graph now that were not there at `date`. */
  came: string[];
  /** The things there at `date` that are gone now. */
  went: string[];
}

/** The graph true on `date` on the axis, with the things that came and went by `now`. */
export function asAtView(graph: Graph, axis: Axis, date: string, now: string): AsAtView {
  const then = gs.asAt(graph, axis, date);
  const latest = gs.asAt(graph, axis, now);
  const sets = compareSets(then.nodes.keys(), latest.nodes.keys());
  return { graph: then, came: sets.onlyB, went: sets.onlyA };
}
