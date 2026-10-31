// Exploring a graph as a mind map from one thing (editor spec §71). Roger, 31 Oct 2026: start from one thing and open
// branches one at a time, in every view.
//
// The thing it starts from is the centre. Each thing shown has one parent: the thing its branch was opened from. So
// what is shown reads as a tree from the centre. Any other link between two shown things is a cross-link.
//
// Opening a branch adds that one thing's hidden neighbours, a few at a time, and nothing else. Closing it hides all
// that was reached through it. Nothing else shown ever changes, so a view can keep every other box where it is.
//
// Host-free and pure: it reads the drawing, and never changes it. Views lay out `part()` in the shape they draw.
import { EXPANSION_MOST, partOf } from './expand-on-demand.ts';
import { adjacency, edgesOf } from './focus.ts';
import type { GraphDrawing } from './note-reading.ts';

/** How many things one branch shows at first: a mind map reads well with about a dozen per branch. */
export const BRANCH_FIRST = 12;
/** The fewest and most things a branch may show at once, as the per-branch dial allows. */
export const BRANCH_RANGE = [6, 40] as const;
/** The most steps out the depth dial reaches. */
export const DEPTH_MOST = 5;

/** A link between two shown things, by their keys. */
export interface ExploreLink {
  from: string;
  to: string;
}

/** An exploration as plain data, to keep on the back trail or save, and to rebuild from. */
export interface ExploreState {
  centre: string;
  /** Each shown thing but the centre with its parent, in the order they were shown. */
  parents: [string, string][];
  perBranch: number;
}

/** The things shown around a centre, each with the parent its branch was opened from. */
export class ExploreMap {
  private readonly drawing: GraphDrawing;
  private readonly adj: Map<string, [number, string][]>;
  private readonly order: Map<string, number>;
  private root: string;
  private per: number;
  /** Each shown thing's parent; the centre has none. Kept in the order things were shown. */
  private parent = new Map<string, string | undefined>();

  /** An exploration of `drawing` from thing `centre`, showing `perBranch` things a branch at once. */
  constructor(drawing: GraphDrawing, centre: string, perBranch = BRANCH_FIRST) {
    this.drawing = drawing;
    this.adj = adjacency(edgesOf(drawing));
    this.order = new Map(drawing.boxes.map((b, i) => [b.key, i]));
    this.root = centre;
    this.per = clampBranch(perBranch);
    this.parent.set(centre, undefined);
  }

  /** The exploration `state` held, rebuilt on `drawing`. Things the drawing no longer holds are left out. */
  static from(drawing: GraphDrawing, state: ExploreState): ExploreMap {
    const map = new ExploreMap(drawing, state.centre, state.perBranch);
    for (const [key, parent] of state.parents)
      if (map.order.has(key) && map.parent.has(parent) && !map.parent.has(key)) map.parent.set(key, parent);
    return map;
  }

  /**
   * An exploration of `drawing` showing `centre` and the things `shown`, as a saved one opens again (explore_saved).
   * Each parent is read from the centre, as a recentre reads it. A thing the drawing lacks, or that no shown thing
   * links back to the centre, is left out.
   */
  static of(drawing: GraphDrawing, centre: string, shown: readonly string[], perBranch?: number): ExploreMap {
    const map = new ExploreMap(drawing, centre, perBranch);
    for (const key of shown) if (map.order.has(key)) map.parent.set(key, centre);
    map.recentre(centre);
    return map;
  }

  /** The thing the exploration starts from. */
  get centre(): string {
    return this.root;
  }

  /** How many things one branch shows at once. */
  get perBranch(): number {
    return this.per;
  }

  /** Changes how many things one branch shows at once. What is shown stays as it is. */
  set perBranch(n: number) {
    this.per = clampBranch(n);
  }

  /** Every shown thing, the centre first, then in the order they were shown. */
  keys(): string[] {
    return [...this.parent.keys()];
  }

  /** Whether `key` is shown. */
  has(key: string): boolean {
    return this.parent.has(key);
  }

  /** The thing `key`'s branch was opened from; undefined for the centre or a thing not shown. */
  parentOf(key: string): string | undefined {
    return this.parent.get(key);
  }

  /** The shown things opened from `key`, in the order they are written. */
  childrenOf(key: string): string[] {
    const out: string[] = [];
    for (const [k, p] of this.parent) if (p === key) out.push(k);
    return out.sort((a, b) => this.at(a) - this.at(b));
  }

  /** How many steps `key` is from the centre along its branch; -1 when it is not shown. */
  depthOf(key: string): number {
    if (!this.parent.has(key)) return -1;
    let steps = 0;
    for (let at = this.parent.get(key); at !== undefined; at = this.parent.get(at)) steps++;
    return steps;
  }

  /** How many of `key`'s neighbours are not shown yet: the count on its + badge. */
  hidden(key: string): number {
    return this.waiting(key).length;
  }

  /**
   * Opens `key`'s branch: up to `perBranch` of its hidden neighbours. The best-linked are picked first, and ties go
   * to the one written first. Opened again, it shows the next few. Gives back the things it added.
   */
  open(key: string): string[] {
    if (!this.parent.has(key)) return [];
    const room = Math.min(this.per, EXPANSION_MOST - this.parent.size);
    const added = this.waiting(key).slice(0, Math.max(0, room));
    added.sort((a, b) => this.at(a) - this.at(b));
    for (const k of added) this.parent.set(k, key);
    return added;
  }

  /** Closes `key`'s branch: everything reached through it is hidden, and `key` stays. Gives back what it hid. */
  close(key: string): string[] {
    const gone: string[] = [];
    const walk = (at: string) => {
      for (const child of this.childrenOf(at)) {
        walk(child);
        gone.push(child);
      }
    };
    walk(key);
    for (const k of gone) this.parent.delete(k);
    return gone;
  }

  /**
   * Opens every shown branch out to `steps` from the centre, and closes what lies further out. A branch already open
   * keeps what it shows. Gives back what it added and what it hid.
   */
  toDepth(steps: number): { added: string[]; gone: string[] } {
    const most = Math.max(0, Math.min(DEPTH_MOST, Math.round(steps)));
    const gone: string[] = [];
    for (const k of this.keys()) if (this.depthOf(k) === most) gone.push(...this.close(k));
    const added: string[] = [];
    let ring = [this.root];
    for (let d = 0; d < most && ring.length; d++) {
      const next: string[] = [];
      for (const k of ring) {
        if (!this.childrenOf(k).length) added.push(...this.open(k));
        next.push(...this.childrenOf(k));
      }
      ring = next;
    }
    return { added, gone };
  }

  /**
   * Makes `key` the centre. Everything shown stays shown; each thing's parent is read again as its nearest step back
   * toward the new centre. A thing not shown yet, picked from search, keeps only the shown things linked to it.
   */
  recentre(key: string): void {
    const shown = new Set(this.keys());
    shown.add(key);
    const parent = new Map<string, string | undefined>([[key, undefined]]);
    let ring = [key];
    while (ring.length) {
      const next: string[] = [];
      for (const at of ring)
        for (const [, other] of this.near(at))
          if (shown.has(other) && !parent.has(other)) {
            parent.set(other, at);
            next.push(other);
          }
      ring = next;
    }
    // every shown thing hangs off the old centre, so all stay when the new centre was shown already
    this.root = key;
    this.parent = parent;
  }

  /** Links between shown things that are not a step along a branch: drawn faint and dashed. */
  crossLinks(): ExploreLink[] {
    const out: ExploreLink[] = [];
    const seen = new Set<string>();
    for (const e of edgesOf(this.drawing)) {
      if (e.from === e.to || !this.parent.has(e.from) || !this.parent.has(e.to)) continue;
      const step = this.parent.get(e.to) === e.from || this.parent.get(e.from) === e.to;
      const pair = [e.from, e.to].sort().join('\n');
      // the first link of a parent and child is the step; any more between them are cross-links too
      if (step && !seen.has(pair)) seen.add(pair);
      else out.push({ from: e.from, to: e.to });
    }
    return out;
  }

  /** The drawing cut down to what is shown and the links among those, to lay out on its own. */
  part(): GraphDrawing {
    return partOf(this.drawing, this.parent.keys());
  }

  /** The exploration as plain data. */
  state(): ExploreState {
    const parents: [string, string][] = [];
    for (const [k, p] of this.parent) if (p !== undefined) parents.push([k, p]);
    return { centre: this.root, parents, perBranch: this.per };
  }

  /** `key`'s neighbours that are not shown, best-linked first, ties in the order written. */
  private waiting(key: string): string[] {
    const found = new Set<string>();
    for (const [, other] of this.near(key)) if (!this.parent.has(other)) found.add(other);
    return [...found].sort((a, b) => this.links(b) - this.links(a) || this.at(a) - this.at(b));
  }

  /** `key`'s links, but none to itself. */
  private near(key: string): [number, string][] {
    return (this.adj.get(key) ?? []).filter(([, other]) => other !== key);
  }

  /** How many links `key` has. */
  private links(key: string): number {
    return this.near(key).length;
  }

  /** Where `key` is written among the drawing's things. */
  private at(key: string): number {
    return this.order.get(key) ?? Number.MAX_SAFE_INTEGER;
  }
}

/** `n` as a whole number within the per-branch dial's range. */
function clampBranch(n: number): number {
  const [least, most] = BRANCH_RANGE;
  return Number.isFinite(n) ? Math.max(least, Math.min(most, Math.round(n))) : BRANCH_FIRST;
}
