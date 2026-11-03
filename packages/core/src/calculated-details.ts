// What the details panel says of a calculated value (editor spec §57, calc_details_shown). A calculated value is
// marked as worked out. It shows the expression it came from and offers no field to change it, because it is never
// typed (calc_by_tools). A gap, a loop or a refusal is said in words, not shown as a number or as zero.
//
// Host-free and pure: it reads the graph and gives the rows the panel draws.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { formatCount } from './locale-formats.ts';
import { word } from './words.ts';

/** One calculated value of a thing, as the details panel shows it. */
export interface CalculatedDetail {
  name: string;
  /** The value with its unit, or the reason there is none, in words. */
  shown: string;
  /** The expression it was worked out from. */
  expression: string;
  /** What to know besides: how many inputs it lacked, in words; empty when none. */
  note: string;
}

/** The calculated values of thing `key`, by name, each with its expression; none when its kind declares none. */
export function calculatedDetails(graph: Graph, key: string): CalculatedDetail[] {
  const values = gs.calculate(graph, [key]).values;
  const own = Object.hasOwn(values, key) ? (values[key] ?? {}) : {};
  const labels = [...(graph.nodes.get(key)?.[0] ?? [])];
  const declared = gs.calculatedOf(graph).filter((d) => d.is !== null && labels.includes(String(d.of)));
  return Object.entries(own).map(([name, v]) => {
    const unit = v.unit ? ` ${v.unit}` : '';
    const shown =
      v.loop !== null
        ? word('details.calculated-loop', { things: v.loop.join(', ') })
        : v.refusal !== null
          ? v.refusal
          : v.value === null
            ? word('details.calculated-gap')
            : `${formatCount(v.value)}${unit}`;
    const note = v.value !== null && v.missing ? word('details.calculated-missing', { count: v.missing }) : '';
    return { name, shown, expression: String(declared.find((d) => d.name === name)?.is ?? ''), note };
  });
}
