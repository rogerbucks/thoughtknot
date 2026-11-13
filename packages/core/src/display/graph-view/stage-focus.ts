// What the stage has in focus (editor spec §73, render_focus, hover_calm). That is the thing chosen, the thing the
// pointer rests on, and a road chosen by a click on it. Chosen things show their links at once. A thing the pointer
// only crosses is marked faintly at once, and nothing else changes. Its links show once the pointer slows and rests on
// it. So the drawing stays calm as the pointer crosses it (Roger, 7 and 8 Nov 2026).
import type { Focus } from '../../render/render-focus.ts';
import { pickAt } from '../../render/render-camera.ts';
import type { Mark } from '../../render/render-marks.ts';
export { pickRoad } from '../../render/render-focus.ts';
export { StageUntangle } from './stage-untangle.ts';

/** How long the pointer rests on a thing before its links show, in milliseconds. */
export const HOVER_MS = 400;
/** How long a thing in focus stays after the pointer leaves it, so crossing a gap does not flicker, in milliseconds. */
export const LEAVE_MS = 200;
/** How fast a pointer still crosses the drawing, in pixels a millisecond. Slower than this, it is resting. */
export const CROSSING = 0.3;

/** The timers the stage keeps: the window's, or none where there is no window. */
interface Clock {
  setTimeout: (run: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

/** The focus of one stage. It calls `redraw` when what it shows changes. */
export class StageFocus {
  private hovered: string | null = null;
  private near: string | null = null;
  private timer: number | null = null;
  private leaving: number | null = null;
  /** The road chosen by a click on it, by the keys at its ends. */
  road: { a: string; b: string } | null = null;

  private readonly redraw: () => void;
  private readonly clock: Clock | undefined;

  constructor(redraw: () => void, clock: Clock | undefined = typeof window === 'undefined' ? undefined : window) {
    this.redraw = redraw;
    this.clock = clock;
  }

  /**
   * The pointer is over `key`, or over nothing, `moving` when it still crosses the drawing. A thing is marked faintly
   * at once. Its links show once the pointer has rested on it for HOVER_MS. Leaving it, they go after LEAVE_MS.
   */
  hover(key: string | null, moving = false): void {
    if (key !== this.near) {
      this.near = key;
      this.redraw();
    } else if (!moving && (this.timer !== null || key === this.hovered)) return; // already waiting, or shown
    this.wait(null);
    if (key === this.hovered) return void this.stay();
    if (this.hovered && this.leaving === null) this.leaving = this.after(LEAVE_MS, () => this.left());
    if (key) this.wait(this.after(HOVER_MS, () => this.show(key)));
  }

  /**
   * Watches a mouse over `canvas`: resting on a thing in the stage's `marks` shows its links after a moment. Nothing
   * shows while the stage is `busy` with a drag or a pinch, or for a touch, which has no hover.
   */
  watch(canvas: HTMLCanvasElement, stage: () => { marks: readonly Mark[]; busy: boolean }): void {
    let last: { x: number; y: number; t: number } | null = null;
    canvas.addEventListener('pointermove', (e) => {
      const { marks, busy } = stage();
      if (busy || e.pointerType === 'touch') return this.cancel();
      const r = canvas.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
      const speed = last ? Math.hypot(at.x - last.x, at.y - last.y) / Math.max(1, at.t - last.t) : 0;
      last = at;
      this.hover(pickAt(marks, at.x, at.y), speed > CROSSING);
    });
    canvas.addEventListener('pointerleave', () => ((last = null), this.hover(null)));
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
    this.wait(null);
  }

  /** What is in focus, with `selected` the thing chosen now, and the thing the pointer only crosses as `near`. */
  of(selected: string | null | undefined): Focus {
    const keys = [selected, this.hovered].filter((k, i, all): k is string => !!k && all.indexOf(k) === i);
    const near = this.near && !keys.includes(this.near) ? { near: this.near } : {};
    return this.road ? { keys, road: this.road, ...near } : { keys, ...near };
  }

  /** Shows the links of `key`, or of nothing. */
  private show(key: string | null): void {
    this.timer = null;
    this.stay();
    if (key === this.hovered) return;
    this.hovered = key;
    this.redraw();
  }

  /** The pointer has left the thing whose links show: they go. */
  private left(): void {
    this.leaving = null;
    this.hovered = null;
    this.redraw();
  }

  /** Keeps what is shown: a leave still waiting is called off. */
  private stay(): void {
    if (this.leaving !== null) this.clock?.clearTimeout(this.leaving);
    this.leaving = null;
  }

  /** Waits on `timer` for a thing to show, in place of any wait before it; null waits on none. */
  private wait(timer: number | null): void {
    if (this.timer !== null) this.clock?.clearTimeout(this.timer);
    this.timer = timer;
  }

  /** Runs `run` after `ms`, or at once where there are no timers. */
  private after(ms: number, run: () => void): number | null {
    if (this.clock) return this.clock.setTimeout(run, ms);
    run();
    return null;
  }
}
