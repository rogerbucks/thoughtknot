// Comparing two sets of things (editor spec §60, discover_compare_sets): two filters or two lenses give the things in
// the first only, the second only, and both. Each list keeps the order the thing was first met.

/** The three sets two sets of things make. */
export interface Compared {
  onlyA: string[];
  onlyB: string[];
  both: string[];
}

/** What is in `a` only, `b` only, and both. */
export function compareSets(a: Iterable<string>, b: Iterable<string>): Compared {
  const inA = new Set(a);
  const inB = new Set(b);
  return {
    onlyA: [...inA].filter((k) => !inB.has(k)),
    onlyB: [...inB].filter((k) => !inA.has(k)),
    both: [...inA].filter((k) => inB.has(k)),
  };
}
