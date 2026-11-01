// Semantic zoom on a card (editor spec §68, projection_semantic_zoom). Picked as the lens, it steps the ladder of detail
// as the person zooms. Far out each group is a box with its count, nearer its things, nearest their properties. Each rung
// is laid out as its own picture, and the layout glide keeps what was in view where it was (r_keep_place). The sums
// are in semantic-zoom.ts.
//
// It waits until the zoom rests, then steps once, the way the person zoomed. It does not step while a new layout glides
// in, so the change of size a new picture brings never steps it again.
import { LAYOUT_GLIDE_MS } from '../../layout-glide.ts';
import type { Lens } from '../../lenses.ts';
import { semanticStep, thingsSeen } from '../../semantic-zoom.ts';
import type { SemanticRung } from '../../semantic-zoom.ts';
import type { ViewState } from '../../view-switches.ts';
import type { View } from '../../zoom.ts';

/** How long the zoom rests, in milliseconds, before semantic zoom steps. */
export const SEMANTIC_REST_MS = 250;

/** What semantic zoom asks of its card. */
export interface SemanticHost {
  win: { setTimeout: (f: () => void, ms: number) => number; clearTimeout: (id: number) => void };
  /** The View menu's state: the lens it picks, and the rung it stands on. */
  state: ViewState;
  /** The lens the graph's Render sets, if the View menu picks none. */
  written?: Lens;
  /** The view as it is now, and the viewport's size on screen. */
  view: () => View;
  size: () => { width: number; height: number };
  /** Steps to a rung, laying the graph out again as the View menu's ladder does. */
  step: (r: SemanticRung) => void;
}

/** One card's semantic zoom. */
export class SemanticZoom {
  private readonly host: SemanticHost;
  /** The scale the last step was judged at: zooming past it is in, short of it out. */
  private judged: number | null = null;
  private timer: number | null = null;
  /** Until when a new layout glides in, so a change of view is not the person's. */
  private still = 0;

  constructor(host: SemanticHost) {
    this.host = host;
  }

  /** Whether semantic zoom is the lens. */
  get on(): boolean {
    return (this.host.state.lens ?? this.host.written) === 'semantic';
  }

  /** The lens was picked: semantic zoom steps to the rung that fits at once, with no margin. */
  picked(): void {
    this.judged = null;
    if (this.on) this.judge(0);
  }

  /** The drawing was laid out again: the view it settles in is where the next zoom is judged from. */
  redrawn(): void {
    this.still = Date.now() + LAYOUT_GLIDE_MS;
    this.judged = null;
  }

  /** The view moved or zoomed: once it rests, semantic zoom steps the way it zoomed. */
  changed(): void {
    if (!this.on) return;
    if (this.timer !== null) this.host.win.clearTimeout(this.timer);
    this.timer = this.host.win.setTimeout(() => {
      this.timer = null;
      const scale = this.host.view().scale;
      if (Date.now() < this.still || this.judged === null) this.judged = scale;
      else if (scale !== this.judged) this.judge(scale > this.judged ? 1 : -1);
    }, SEMANTIC_REST_MS);
  }

  /** Steps the rung `way`, as the things on screen now say. */
  private judge(way: -1 | 0 | 1): void {
    const { state, view, size, step } = this.host,
      v = view();
    this.judged = v.scale;
    const to = semanticStep(thingsSeen(state.things, v.scale, size()), state.rung, way);
    if (to !== state.rung) step(to);
  }
}
