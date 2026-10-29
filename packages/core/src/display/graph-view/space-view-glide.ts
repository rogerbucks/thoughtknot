// The view in space glides as its drawing is laid out again (editor spec §68, layout_glide; ethos principle 8). The
// things and the camera ease from where they were to where they go, a frame at a time (space-glide.ts). A reach for
// the view ends the glide at once, and where motion is to be still the end shows at once.
import { LAYOUT_GLIDE_MS } from '../../layout-glide.ts';
import { spaceGlide } from '../../space-glide.ts';
import { between } from '../../space-controls.ts';
import type { Block, Orbit, SpaceMarks } from '../../space-view.ts';
import { reducedMotion } from './details-nav.ts';

/** What ends a glide at once: the person reaching for the view, to turn, move, zoom, pick or press a key. */
const REACHES = ['pointerdown', 'wheel', 'keydown'] as const;

/** The drawing the view in space paints: as laid out, or a step of its glide there. One glide at a time. */
export class SpaceGlide {
  /** What is painted now. */
  shown: SpaceMarks;
  private run = 0;
  /** Ends the glide under way, the drawing as laid out and the camera where the glide was taking it. */
  private end: (() => void) | null = null;
  private readonly el: HTMLElement;
  private readonly paint: () => void;
  private readonly camera: (o: Orbit) => void;

  /**
   * For the view `el`, first showing `space`. `paint` paints what is shown, and `camera` puts the camera where the
   * glide says.
   */
  constructor(el: HTMLElement, space: SpaceMarks, paint: () => void, camera: (o: Orbit) => void) {
    [this.el, this.shown, this.paint, this.camera] = [el, space, paint, camera];
    // caught on the way down, so the glide ends before the view acts on the reach. Its end is painted here, as the
    // view need not paint again for a reach it ignores
    const reach = () => this.end && (this.settle(), this.paint());
    for (const type of REACHES) el.addEventListener(type, reach, { capture: true });
  }

  /** The block shown now for `block`, by its thing, so the ring round a picked thing glides with it. */
  match(block: Block | null): Block | null {
    if (!block || this.shown.blocks.includes(block)) return block;
    return this.shown.blocks.find((b) => b.of !== undefined && b.of === block.of) ?? block;
  }

  /** Ends a glide under way, and gives what was shown: the drawing a new layout glides from. */
  settle(): SpaceMarks {
    this.run++;
    const end = this.end;
    this.end = null;
    end?.();
    return this.shown;
  }

  /**
   * Shows `space`, laid out again: glided to from `from`, the drawing shown before, the camera from `fromOrbit` to
   * `toOrbit`. Where motion is to be still, or nothing moved, it shows the end at once.
   */
  to(space: SpaceMarks, from: SpaceMarks, fromOrbit: Orbit, toOrbit: Orbit): void {
    this.settle();
    const win = this.el.win,
      step = reducedMotion(win) ? null : spaceGlide(from, space);
    this.shown = space;
    if (!step) return this.paint();
    const run = this.run;
    this.end = () => {
      this.shown = space;
      this.camera(toOrbit);
    };
    let start: number | null = null;
    const frame = (time?: number) => {
      if (run !== this.run) return;
      const now = typeof time === 'number' ? time : Date.now();
      start ??= now;
      const t = (now - start) / LAYOUT_GLIDE_MS;
      if (t >= 1) {
        this.settle();
        return this.paint();
      }
      this.shown = step(t);
      this.camera(between(fromOrbit, toOrbit, t));
      this.paint();
      win.requestAnimationFrame(frame);
    };
    this.shown = step(0);
    this.camera(fromOrbit);
    this.paint();
    win.requestAnimationFrame(frame);
  }
}
