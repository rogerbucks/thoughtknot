// A filtered view for each corporate setting (editor spec §40, corporate_filtered_views). Experimental: behind a switch,
// off by default. Off, nothing changes: the graph given is the graph back.
// - On, a setting's view starts from the explicit base grants: only the things the person may read (§39, the core's
//   permissions). Then the setting's redactions apply. A redaction only ever takes away.
// - A small override for one setting is one more redaction. It applies only once a person has confirmed it. An
//   override can never add back what the grants or the setting took out: its shape has no way to say so.
import { applyBoundary, readable } from '@thoughtknot/core';
import type { Guarded, Permissions } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { Redaction } from '@thoughtknot/core';
import type { Setting } from './setting.ts';

/** Whether filtered views are on when nothing says. They are experimental, so off. */
export const FILTERED_VIEWS_DEFAULT = false;

/** One small override for a setting: an id a person confirms, and the one more redaction it makes. */
export interface Override {
  id: string;
  redact: Redaction;
}

/** The base grants a view starts from: the permissions, whose view it is, and where each thing lives. */
export interface BaseGrants {
  permissions: Permissions;
  person: string;
  things: readonly Guarded[];
}

/** A view's switches: on or off, its overrides, and the ids of those a person confirmed. */
export interface ViewSwitch {
  on?: boolean;
  overrides?: readonly Override[];
  confirmed?: ReadonlySet<string>;
}

type Shape = Pick<Graph, 'nodes' | 'edges'>;

/** The setting's view of `base` for one person, or `base` itself when the switch is off. */
export function filteredView(base: Shape, grants: BaseGrants, setting: Setting, view: ViewSwitch = {}): Shape {
  if (!(view.on ?? FILTERED_VIEWS_DEFAULT)) return base;
  const may = new Set(
    readable(grants.permissions, grants.person, grants.things).flatMap((t) => (t.id === undefined ? [] : [t.id])),
  );
  const nodes = new Map([...base.nodes].filter(([id]) => may.has(id)));
  const edges = base.edges.filter(([a, , b]) => nodes.has(a) && nodes.has(b));
  const confirmed = view.confirmed ?? new Set<string>();
  const extra = (view.overrides ?? []).filter((o) => confirmed.has(o.id)).map((o) => o.redact);
  // the AI label is the setting's export rule; a view only narrows, so it leaves the values as they are
  const out = applyBoundary({ nodes, edges }, { redact: [...setting.redact, ...extra], aiLabel: setting.aiLabel });
  for (const [id, [, props]] of out.graph.nodes) {
    const was = base.nodes.get(id)?.[1];
    if (was && !('ai_label' in was)) delete props['ai_label'];
  }
  return out.graph;
}
