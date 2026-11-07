// What the stage has in focus (editor spec §73, render_focus). That is the thing chosen, the thing the pointer rests
// on, and a road chosen by a click on it. Chosen things show their links at once. Hovered ones wait a moment, so links
// do not flicker as the pointer crosses the drawing (Roger, 7 Nov 2026).
import type { Focus } from '../../render/render-focus.ts';
import { pickAt } from '../../render/render-camera.ts';
import type { Mark } from '../../render/render-marks.ts';
export { pickRoad } from '../../render/render-focus.ts';

/** How long the pointer rests on a thing before its links show, in milliseconds. */
export const HOVER_MS = 400;

/** The timers the stage keeps: the window's, or none where there is no window. */
interface Clock {
  setTimeout: (run: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

/** The focus of one stage. It calls `redraw` when what it shows changes. */
export class StageFocus {
  private hovered: string | null = null;
  private waiting: string | null = null;
  private timer: number | null = null;
  /** The road chosen by a click on it, by the keys at its ends. */
  road: { a: string; b: string } | null = null;

  private readonly redraw: () => void;
  private readonly clock: Clock | undefined;

  constructor(redraw: () => void, clock: Clock | undefined = typeof window === 'undefined' ? undefined : window) {
    this.redraw = redraw;
    this.clock = clock;
  }

  /** The pointer rests on `key`, or on nothing. A new thing shows after HOVER_MS; leaving it clears at once. */
  hover(key: string | null): void {
    if (key === this.waiting || (key && key === this.hovered)) return;
    this.cancel();
    this.waiting = key;
    if (!key) {
      if (!this.hovered) return;
      this.hovered = null;
      this.redraw();
      return;
    }
    const show = (): void => {
      this.timer = null;
      this.hovered = key;
      this.redraw();
    };
    if (this.clock) this.timer = this.clock.setTimeout(show, HOVER_MS);
    else show();
  }

  /**
   * Watches a mouse over `canvas`: resting on a thing in the stage's `marks` shows its links after a moment. Nothing
   * shows while the stage is `busy` with a drag or a pinch, or for a touch, which has no hover.
   */
  watch(canvas: HTMLCanvasElement, stage: () => { marks: readonly Mark[]; busy: boolean }): void {
    canvas.addEventListener('pointermove', (e) => {
      const { marks, busy } = stage();
      if (busy || e.pointerType === 'touch') return this.cancel();
      const r = canvas.getBoundingClientRect();
      this.hover(pickAt(marks, e.clientX - r.left, e.clientY - r.top));
    });
    canvas.addEventListener('pointerleave', () => this.hover(null));
  }

  /** Chooses `road`, or lets the road chosen go; draws again when that changes. Says whether a road is chosen. */
  choose(road: { a: string; b: string } | null): boolean {
    const same = road?.a === this.road?.a && road?.b === this.road?.b;
    this.road = road;
    if (!same) this.redraw();
    return !!road;
  }

  /** Stops a hover still waiting to show. */
  cancel(): void {
    if (this.timer !== null) this.clock?.clearTimeout(this.timer);
    this.timer = null;
    this.waiting = null;
  }

  /** What is in focus, with `selected` the thing chosen now. */
  of(selected: string | null | undefined): Focus {
    const keys = [selected, this.hovered].filter((k, i, all): k is string => !!k && all.indexOf(k) === i);
    return this.road ? { keys, road: this.road } : { keys };
  }
}
