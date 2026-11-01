// The graphs and things a person opened last (risk NEURO-11). Someone who stops mid-task can see where they were. The
// list is kept by the host with its own data, newest first. It is host-free and pure.

/** One graph, or one thing of it, that was opened: the note it is in, the graph's name, and the thing's key if any. */
export interface RecentVisit {
  path: string;
  graph: string;
  thing?: string;
}

/** How many visits are kept. */
export const VISITS_KEPT = 10;

const same = (a: RecentVisit, b: RecentVisit): boolean =>
  a.path === b.path && a.graph === b.graph && a.thing === b.thing;

/** `list` with `visit` at its head, a visit already there moved up and not twice, and no more than VISITS_KEPT kept. */
export const withVisit = (list: readonly RecentVisit[], visit: RecentVisit): RecentVisit[] =>
  [visit, ...list.filter((v) => !same(v, visit))].slice(0, VISITS_KEPT);

/** The visits in what was saved: each kept when it has its note and graph, else dropped. */
export function visitsFrom(saved: unknown): RecentVisit[] {
  if (!Array.isArray(saved)) return [];
  const kept: RecentVisit[] = [];
  for (const v of saved as unknown[]) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    if (typeof o.path !== 'string' || typeof o.graph !== 'string' || !o.path || !o.graph) continue;
    kept.push(
      typeof o.thing === 'string' ? { path: o.path, graph: o.graph, thing: o.thing } : { path: o.path, graph: o.graph },
    );
  }
  return kept.slice(0, VISITS_KEPT);
}
