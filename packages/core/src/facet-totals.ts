// Totals beside the counts of a filter (editor spec §57, calc_set_totals). Roger, 23 Oct 2026: say the total of a
// chosen number or calculated property beside each value's count, and for all the things kept.
//
// A measure gives each thing a number, or nothing. A total adds the numbers there are. It says how many things had
// none (`missing`) and never counts one as zero (calc_gaps_said). Like the counts, each filter's totals follow the
// other filters' choices, not its own. It is one pass over the things for each filter, so 10,000 things total fast.
//
// Host-free and pure. A measure of numbers with no unit and one of calculated values are read by this same code.
import type { Chosen, FacetIndex } from './facet-counts.ts';

/** A number for each thing, by the thing's place in the index's keys; nothing where it has none. */
export interface Measure {
  /** The property it measures, such as `cost`. */
  name: string;
  /** The unit its numbers are in, or empty text for a plain number. */
  unit: string;
  values: readonly (number | null | undefined)[];
}

/** What a set of things adds up to. `total` is null when none of them had a number. */
export interface Total {
  total: number | null;
  /** How many of the things had a number. */
  counted: number;
  /** How many had none. They are not in the total, and are not counted as zero. */
  missing: number;
}

/** One value of a filter, with how many things it holds and what they add up to. */
export interface FacetTotal extends Total {
  value: string;
  count: number;
}

/** The totals of every filter's values, and of all the things kept. */
export interface Totals {
  facets: Map<string, FacetTotal[]>;
  kept: Total;
}

/** A running total, kept in plain numbers so a pass over many things allocates nothing. A table's totals use it too. */
export class Running {
  sum = 0;
  counted = 0;
  missing = 0;
  add(v: number | null | undefined): void {
    if (typeof v === 'number' && Number.isFinite(v)) {
      this.sum += v;
      this.counted++;
    } else this.missing++;
  }
  result(): Total {
    return { total: this.counted ? this.sum : null, counted: this.counted, missing: this.missing };
  }
}

/** The totals of `measure` under what is `chosen`, beside each filter value's count. */
export function facetTotals(index: FacetIndex, chosen: Chosen, measure: Measure): Totals {
  const wanted = index.wanted(chosen);
  const facets = new Map<string, FacetTotal[]>();
  index.facets.forEach((facet, f) => {
    const order = index.order[f] ?? [],
      codes = index.codes[f] as Int16Array | Int32Array;
    const runs = order.map(() => new Running());
    for (let i = 0; i < index.keys.length; i++) {
      const v = codes[i] as number;
      if (v >= 0 && index.keeps(i, wanted, f)) (runs[v] as Running).add(measure.values[i]);
    }
    facets.set(
      facet.name,
      order.map((value, k) => {
        const r = (runs[k] as Running).result();
        return { value, count: r.counted + r.missing, ...r };
      }),
    );
  });
  const all = new Running();
  for (let i = 0; i < index.keys.length; i++) if (index.keeps(i, wanted)) all.add(measure.values[i]);
  return { facets, kept: all.result() };
}
