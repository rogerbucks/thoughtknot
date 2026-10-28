// The work each pass that draws links may do, counted as it is done (editor spec §68, layout_work_counted). Roger,
// 25 Oct 2026. A budget worked out from the graph's size before a pass can be far off. One once said a pass would
// look 300 times less than it did. So each pass counts the looks it really takes, as it takes them. It stops
// when the next would go past its budget, keeping what it has worked out. So no pass takes longer as a graph grows past
// what its budget says. The Python library counts the same way (graphspec/style/work.py). Host-free and pure.

/** A pass's budget of work and the steps it has taken against it. */
export class Work {
  /** The steps taken so far: never more than `most`. */
  done = 0;
  /** The most steps the pass may take. */
  readonly most: number;
  constructor(most: number) {
    this.most = most;
  }

  /** Takes `n` more steps if the budget holds them, and says so; past it, takes none and says no. */
  take(n: number): boolean {
    if (this.done + n > this.most) return false;
    this.done += n;
    return true;
  }
}

/** Each pass's budget, in steps: a look at a box, a pair of links or a spot for words. */
export const WORK_MOST = {
  /** Whether links drawn straight cross boxes or each other, before the boxes are given room. */
  crowded: 40_000_000,
  /** Moving boxes off the links they do not join, and apart from each other. */
  settle: 4_000_000,
  /** Trying each link at a few bends, against the boxes. */
  bends: 10_000_000,
  /** Comparing each bend tried with the other links, for crossings. */
  crossings: 10_000_000,
  /** Finding a clear spot for each link's words. */
  words: 4_000_000,
} as const;

/**
 * The most looks a drawing's links are planned to take to be compared for crossings, from its counts of links and
 * boxes. Past it they are scored by the boxes alone, as before the work was counted, so a drawing reads as it did.
 */
export const CROSSINGS_PLANNED = 40_000_000;

/** The work of one drawing's link passes, each against its own budget. */
export type LinkWork = Record<keyof typeof WORK_MOST, Work>;

/** A fresh budget for each link pass of one drawing. */
export const linkWork = (): LinkWork => ({
  crowded: new Work(WORK_MOST.crowded),
  settle: new Work(WORK_MOST.settle),
  bends: new Work(WORK_MOST.bends),
  crossings: new Work(WORK_MOST.crossings),
  words: new Work(WORK_MOST.words),
});
