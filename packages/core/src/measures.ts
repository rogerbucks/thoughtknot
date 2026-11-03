// The numbers a filter can total (editor spec §57, calc_set_totals, calc_measures_shared). A graph's calculated
// values and its plain number properties are both measures, and facet-totals.ts adds either up with the same code.
//
// A property is a measure when at least two of the things have a number for it. A calculated value is one when the
// schema declares it. Host-free and pure: it reads the graph and gives a number for each thing, or nothing.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import type { Measure } from './facet-totals.ts';

/** The measures of `graph` for the things `keys`, by name: calculated ones, then number properties. */
export function measuresOf(graph: Graph, keys: readonly string[]): Measure[] {
  const calculated = gs.calculate(graph, [...keys]).values;
  const out = new Map<string, Measure>();
  keys.forEach((key, at) => {
    for (const [name, v] of Object.entries(Object.hasOwn(calculated, key) ? (calculated[key] ?? {}) : {})) {
      const m = out.get(name) ?? { name, unit: '', values: new Array<number | null>(keys.length).fill(null) };
      (m.values as (number | null)[])[at] = v.value;
      if (!m.unit && v.unit) m.unit = v.unit;
      out.set(name, m);
    }
  });
  const calcNames = new Set(out.keys());
  const props = new Map<string, (number | null)[]>();
  keys.forEach((key, at) => {
    for (const [name, v] of Object.entries(graph.p(key))) {
      if (name === 'id' || calcNames.has(name) || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const column = props.get(name) ?? new Array<number | null>(keys.length).fill(null);
      column[at] = v;
      props.set(name, column);
    }
  });
  for (const [name, values] of props)
    if (values.filter((v) => v !== null).length >= 2) out.set(name, { name, unit: '', values });
  return [...out.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
