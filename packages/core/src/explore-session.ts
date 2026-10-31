// One card's exploration from one thing, as its controls drive it (editor spec §71). Roger, 31 Oct 2026: explore a
// graph mind-map style, with the controls on screen.
//
// It holds what is shown (explore-map.ts) and the shape it is drawn in. It keeps the spots it was last placed at, and
// the trail for Back and Next. Each change is one step on the trail. It gives the card what to keep and where to place it,
// which the card lays out as it lays out Show only. Host-free and pure: it never changes the drawing.
import { ExploreMap } from './explore-map.ts';
import type { ExploreState } from './explore-map.ts';
import type { ExploreSave } from './explore-saved.ts';
import { Trail } from './explore-trail.ts';
import type { FocusEdge, Kept } from './focus.ts';
import { EXPLORE_SHAPES, exploreSpots } from './layouts/explore-shapes.ts';
import type { ExploreShape, ExploreSpot } from './layouts/explore-shapes.ts';
import type { GraphDrawing } from './note-reading.ts';

/** The layout strategy an exploration is laid out by: its own spots, given to our engine as a plug-in's are. */
export const EXPLORE_STRATEGY = 'thoughtknot.explore.shape';

/** What a card keeps while exploring: the things and links shown, and each thing's spot across and down. */
export interface ExploreKept extends Kept {
  placed: Map<string, [number, number]>;
  /** The links shown that are not a step along a branch, drawn faint and dashed (explore_tree_from_centre). */
  cross: Set<number>;
}

/** A thing's badge: how many of its neighbours wait, and whether its branch is open. */
export interface ExploreBadge {
  key: string;
  hidden: number;
  open: boolean;
}

/** One step on the trail: what was shown, in which shape. */
interface Step {
  state: ExploreState;
  shape: ExploreShape;
}

/** One card's exploration: what is shown, its shape, and the trail of changes. */
export class ExploreSession {
  private map: ExploreMap;
  private chosen: ExploreShape;
  private spots: Map<string, ExploreSpot> | undefined;
  private readonly trail = new Trail<Step>();
  private readonly drawing: GraphDrawing;

  /**
   * An exploration of `drawing` from `centre`, shown with its direct links (Roger's pick, 31 Oct 2026). One `saved`
   * opens again as it was saved (explore_saved).
   */
  constructor(drawing: GraphDrawing, centre: string, shape: ExploreShape = 'balanced', saved?: ExploreSave) {
    this.drawing = drawing;
    this.chosen = EXPLORE_SHAPES.includes(shape) ? shape : 'balanced';
    if (saved) this.map = ExploreMap.of(drawing, centre, saved.shown, saved.perBranch);
    else {
      this.map = new ExploreMap(drawing, centre);
      this.map.open(centre);
    }
    this.record();
  }

  /** The exploration as the style graph saves it. */
  save(): ExploreSave {
    const [, ...shown] = this.map.keys();
    return { centre: this.map.centre, shown, shape: this.chosen, perBranch: this.map.perBranch };
  }

  /** The thing the exploration starts from. */
  get centre(): string {
    return this.map.centre;
  }

  /** The shape it is drawn in. */
  get shape(): ExploreShape {
    return this.chosen;
  }

  /** How many steps out the furthest thing shown is: what the depth dial shows. */
  get depth(): number {
    return Math.max(...this.map.keys().map((k) => this.map.depthOf(k)));
  }

  /** How many things one branch shows at once: what the per-branch dial shows. */
  get perBranch(): number {
    return this.map.perBranch;
  }

  /** Every thing shown, the centre first. */
  keys(): string[] {
    return this.map.keys();
  }

  /** What is shown, round which centre and in which shape, in one line: it changes when the picture does. */
  stamp(): string {
    return `${this.chosen} ${this.map.centre} ${this.map.keys().join('\n')}`;
  }

  /** Whether there is a step to go back to, or one to go forward to again. */
  get canBack(): boolean {
    return this.trail.canBack;
  }

  get canNext(): boolean {
    return this.trail.canForward;
  }

  /** Opens `key`'s branch, a few more at a time. False when nothing was added. */
  open(key: string): boolean {
    return this.changed(this.map.open(key).length > 0);
  }

  /** Closes `key`'s branch. False when it hid nothing. */
  close(key: string): boolean {
    return this.changed(this.map.close(key).length > 0);
  }

  /** Opens every branch out to `steps`, and closes what lies further. False when nothing changed. */
  toDepth(steps: number): boolean {
    const { added, gone } = this.map.toDepth(steps);
    return this.changed(added.length + gone.length > 0);
  }

  /** Changes how many things one branch shows at once, for branches opened from now on. */
  setPerBranch(n: number): boolean {
    const was = this.map.perBranch;
    this.map.perBranch = n;
    return this.changed(this.map.perBranch !== was);
  }

  /** Draws it in `shape`, laid out afresh so the view glides there. */
  setShape(shape: ExploreShape): boolean {
    if (shape === this.chosen || !EXPLORE_SHAPES.includes(shape)) return false;
    this.chosen = shape;
    this.spots = undefined;
    return this.changed(true);
  }

  /** Makes `key` the centre, keeping all shown, laid out afresh round it. */
  recentre(key: string): boolean {
    if (key === this.map.centre) return false;
    this.map.recentre(key);
    this.spots = undefined;
    return this.changed(true);
  }

  /** Goes back one step. False at the start. */
  back(): boolean {
    return this.restore(this.trail.back());
  }

  /** Goes forward one step again. False at the end. */
  next(): boolean {
    return this.restore(this.trail.forward());
  }

  /** The badge of each shown thing with neighbours waiting or a branch open, in the order shown. */
  badges(): ExploreBadge[] {
    return this.map
      .keys()
      .map((key) => ({ key, hidden: this.map.hidden(key), open: this.map.childrenOf(key).length > 0 }))
      .filter((b) => b.hidden > 0 || (b.open && b.key !== this.map.centre));
  }

  /** The things shown and the links between them, numbered as `edges` numbers the links: what the card hides the rest by. */
  shown(edges: readonly FocusEdge[]): Kept {
    const things = new Set(this.map.keys());
    const kept = new Set<number>();
    edges.forEach((e, i) => {
      if (things.has(e.from) && things.has(e.to)) kept.add(i);
    });
    return { things, edges: kept };
  }

  /**
   * What the card keeps, numbered as `edges` numbers the links, and where each thing is placed across and down. Each
   * thing shown already keeps its spot from last time (explore_stays_put).
   */
  kept(edges: readonly FocusEdge[]): ExploreKept {
    const things = new Set(this.map.keys());
    const crossLinks = this.map.crossLinks();
    this.spots = exploreSpots(this.map, this.chosen, '2d', { previous: this.spots, crossLinks });
    const placed = new Map([...this.spots].map(([k, s]) => [k, [s[0], s[1]] as [number, number]]));
    const { edges: shown } = this.shown(edges);
    const cross = this.cross(edges);
    return { things, edges: shown, placed, cross };
  }

  /** The links shown that are not a step along a branch, numbered as `edges` numbers them: drawn faint and dashed. */
  cross(edges: readonly FocusEdge[]): Set<number> {
    const things = new Set(this.map.keys()),
      cross = new Set<number>(),
      steps = new Set<string>();
    edges.forEach((e, i) => {
      if (!things.has(e.from) || !things.has(e.to) || e.from === e.to) return;
      // the first link of a parent and its child is the step along the branch; any other is a cross-link
      const pair = [e.from, e.to].sort().join('\n');
      const step = this.map.parentOf(e.to) === e.from || this.map.parentOf(e.from) === e.to;
      if (step && !steps.has(pair)) steps.add(pair);
      else cross.add(i);
    });
    return cross;
  }

  /** Takes a step on the trail when `changed`, and says whether it did. */
  private changed(changed: boolean): boolean {
    if (changed) this.record();
    return changed;
  }

  private record(): void {
    this.trail.push({ state: this.map.state(), shape: this.chosen });
  }

  /** Shows the trail's step `step`, if there is one. */
  private restore(step: Step | undefined): boolean {
    if (!step) return false;
    this.map = ExploreMap.from(this.drawing, step.state);
    if (step.shape !== this.chosen) this.spots = undefined;
    this.chosen = step.shape;
    return true;
  }
}
