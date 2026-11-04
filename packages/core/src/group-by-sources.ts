// More ways to group a large graph's overview (editor spec §60, discover_group_by). A person can group by a property
// or by kind already (group-by.ts). Here they can also group by the look a thing is drawn with, or by the bucket a lens
// puts it in. Each gives the same value-by-thing map the other choices do, so the groups glide to their new places.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import type { GroupBy } from './group-by.ts';
import type { ThingLook } from './style-graph.ts';

/** The choice that groups things by the colour they are drawn in. */
export const BY_LOOK = ':look';
/** The start of a choice that groups things by the bucket of the lens rule that follows it. */
export const BY_BUCKET = ':bucket:';

/** Each thing's look as a value: its colour, for the things that have one. */
export function lookValues(looks: ReadonlyMap<string, ThingLook>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, look] of looks) if (look.hue) out.set(key, look.hue);
  return out;
}

/** Each thing's bucket under a lens `rule`; none when the rule cannot be run. */
export function bucketValues(graph: Graph, rule: string): Map<string, string> {
  return new Map(Object.entries(gs.lensBuckets(graph, rule) ?? {}));
}

/** The grouping a choice makes: none for a choice that gives no values, else the choice with its value of each thing. */
export function groupingOf(by: string, values: ReadonlyMap<string, string>): GroupBy {
  return values.size ? { by, values } : null;
}
