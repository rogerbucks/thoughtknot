// The mini-map of the view in space (editor spec §24, mini_map, mini_map_setting; space_mini_map; ethos principle 8,
// never disorient the user). The 2D drawing has one, and now 2.5D and 3D do too: the same concepts in every view
// (Roger, 24 Oct 2026). It is the whole drawing seen from straight above, in the corner the pad
// leaves free. The floor the camera sees is outlined, its near side the narrower, and the picked thing is marked. A tap
// or drag on it moves the view there, turned and as far off as it was. It shows by the same setting as in 2D: never,
// only when some thing is off the screen (the default), or always. The sums are in space-plan.ts.
import { word } from '@thoughtknot/core';
import type { MiniMapSetting } from '@thoughtknot/core';
import { allInView, lookAt, planOf, seenOf } from '../../space-plan.ts';
import type { Plan, Spot } from '../../space-plan.ts';
import type { Block, Orbit, SpaceMarks } from '../../space-view.ts';
import { miniScale } from './mini-map.ts';
import { make } from './note-callouts.ts';

const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** The mini-map of one view in space. */
export class SpaceMiniMap {
  readonly el: HTMLElement;
  private svg: SVGSVGElement | null = null;
  private seen: SVGPolygonElement | null = null;
  private plan: Plan | null = null;
  /** What the copy was made of: the drawing shown, and the key of the thing picked. */
  private of: [SpaceMarks | null, string | undefined] = [null, undefined];
  /** The pointer that is dragging on it, if one is. */
  private drag: number | null = null;
  private readonly setting: () => MiniMapSetting;

  /** In the view `view`, shown by `setting`. A tap or drag on it moves the `camera` to look at that spot instead. */
  constructor(view: HTMLElement, setting: () => MiniMapSetting, camera: (by: (o: Orbit) => Orbit) => void) {
    this.setting = setting;
    this.el = view.createDiv({
      cls: 'thoughtknot-mini-map is-space',
      attr: { role: 'img', 'aria-label': word('drawing.mini-map') },
    });
    this.el.hidden = true;
    // a press here is the mini-map's alone: the view under it neither turns nor picks
    const at = (e: PointerEvent) => {
      const spot = this.spotAt(e);
      if (spot) camera((o) => lookAt(o, spot));
    };
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.button) return;
      e.preventDefault();
      at(e);
      this.drag = e.pointerId;
      this.el.setPointerCapture?.(e.pointerId);
    });
    this.el.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      if (this.drag === e.pointerId) at(e);
    });
    const end = (e: PointerEvent) => {
      e.stopPropagation();
      if (this.drag !== e.pointerId) return;
      this.drag = null;
      this.el.releasePointerCapture?.(e.pointerId);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  /**
   * The view was painted: `shown` seen through `matrix` from `orbit`, on a screen `width` by `height` pixels, with
   * `picked` picked. The mini-map shows or hides by its setting, copies the drawing if it changed, and outlines what
   * is seen.
   */
  update(shown: SpaceMarks, orbit: Orbit, matrix: Float32Array, size: [number, number], picked: Block | null): void {
    const [width, height] = size,
      setting = this.setting();
    const show =
      setting === 'always' || (setting === 'auto' && !!shown.blocks.length && !allInView(shown, matrix, width, height));
    this.el.hidden = !show;
    if (!show) return;
    if (this.of[0] !== shown || this.of[1] !== picked?.of) this.copy(shown, picked?.of);
    this.seen?.setAttribute(
      'points',
      seenOf(orbit, width / height)
        .map(([x, y]) => `${x},${y}`)
        .join(' '),
    );
  }

  /** Copies `shown` small, the thing `picked` marked. */
  private copy(shown: SpaceMarks, picked: string | undefined): void {
    this.of = [shown, picked];
    this.el.empty();
    const plan = (this.plan = planOf(shown)),
      { bounds: b } = plan;
    const { width, height } = miniScale(b.width, b.height);
    const svg = make('svg', {
      class: 'thoughtknot-mini-svg',
      viewBox: `${b.x} ${b.y} ${b.width} ${b.height}`,
      width,
      height,
      'aria-hidden': 'true',
    });
    for (const line of plan.lines)
      svg.appendChild(
        make('polyline', {
          class: 'thoughtknot-mini-line',
          points: line.map(([x, y]) => `${x},${y}`).join(' '),
          fill: 'none',
        }),
      );
    for (const box of plan.boxes) {
      const marked = picked !== undefined && box.of === picked;
      const { x, y, width: w, height: h } = box;
      svg.appendChild(
        make('rect', { class: `thoughtknot-mini-box${marked ? ' is-picked' : ''}`, x, y, width: w, height: h }),
      );
    }
    this.seen = make('polygon', { class: 'thoughtknot-mini-frame' });
    svg.appendChild(this.seen);
    this.el.appendChild(svg);
    this.svg = svg;
  }

  /** The spot on the floor under the pointer, as far as the drawing's edges allow. */
  private spotAt(e: PointerEvent): Spot | null {
    const r = this.svg?.getBoundingClientRect(),
      b = this.plan?.bounds;
    if (!r?.width || !r.height || !b) return null;
    const fx = clamp((e.clientX - r.left) / r.width),
      fy = clamp((e.clientY - r.top) / r.height);
    return [b.x + fx * b.width, b.y + fy * b.height];
  }
}
