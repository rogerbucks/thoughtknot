// A bulk edit (editor spec §60, discover_bulk_edit): one property set on every thing a filter keeps. It is made in
// two steps. The plan lists every change, to be read before anything is written. Applying it gives the changed graph
// and the plan that undoes it, so one step rolls the whole edit back. The graph given is never changed.
import gs from '@thoughtknot/graph-spec';
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { word } from './words.ts';

/** One thing's property, from what it was (undefined for none) to what it becomes (undefined to remove it). */
export interface BulkChange {
  thing: string;
  before: Value | undefined;
  after: Value | undefined;
}

/** A labelled list of changes to one property. */
export interface BulkPlan {
  label: string;
  property: string;
  changes: BulkChange[];
}

/** The plan to set `property` to `value` on `keys`, leaving out things that already hold it or are not in the graph. */
export function bulkPlan(g: Graph, keys: Iterable<string>, property: string, value: Value | undefined): BulkPlan {
  const changes: BulkChange[] = [];
  for (const thing of new Set(keys)) {
    if (!g.nodes.has(thing)) continue;
    const before = g.p(thing)[property];
    if (before !== value) changes.push({ thing, before, after: value });
  }
  return { label: word('bulk.label', { property, count: changes.length }), property, changes };
}

/** The graph with the plan written, and the plan that puts every thing back as it was. */
export function applyBulk(g: Graph, plan: BulkPlan): { graph: Graph; undo: BulkPlan } {
  const changed = new Map(plan.changes.map((c) => [c.thing, c.after]));
  const nodes = new Map(
    [...g.nodes].map(([id, [labels, props]]) => {
      if (!changed.has(id)) return [id, [labels, props]] as const;
      const next = { ...props };
      const value = changed.get(id);
      if (value === undefined) delete next[plan.property];
      else next[plan.property] = value;
      return [id, [labels, next]] as const;
    }),
  );
  const undo: BulkPlan = {
    label: word('bulk.undo', { label: plan.label }),
    property: plan.property,
    changes: plan.changes.map((c) => ({ thing: c.thing, before: c.after, after: c.before })),
  };
  return { graph: new gs.Graph(nodes as Graph['nodes'], g.edges), undo };
}
