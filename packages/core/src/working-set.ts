// A working set (editor spec §60, discover_working_set): things pinned from anywhere in a graph, then viewed, edited
// or exported on their own. The set is a list of keys. The graph it makes holds those things and the links between
// them, and leaves the graph it came from untouched.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';

/** The set with `keys` added, each once, in the order pinned. */
export function pin(set: readonly string[], keys: Iterable<string>): string[] {
  return [...new Set([...set, ...keys])];
}

/** The set without `keys`. */
export function unpin(set: readonly string[], keys: Iterable<string>): string[] {
  const gone = new Set(keys);
  return set.filter((k) => !gone.has(k));
}

/** The graph of just the pinned things that `g` has, with the links whose two ends are both pinned. */
export function workingGraph(g: Graph, set: readonly string[]): Graph {
  const keep = new Set(set.filter((k) => g.nodes.has(k)));
  const nodes = new Map([...g.nodes].filter(([id]) => keep.has(id)));
  return new gs.Graph(
    nodes,
    g.edges.filter((e) => keep.has(e[0]) && keep.has(e[2])),
  );
}
