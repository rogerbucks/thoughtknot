// The stage of the new rendering (editor spec §73, render_switch; wiki/Rendering-spec.md). With the "New rendering"
// setting on, a graph is drawn here, on one canvas over the card, by the layers one way down. The scene, rooms, detail,
// marks and canvas painter do the work, and this file only wires them to the page. Today's SVG stays underneath,
// hidden, so the old path keeps working until the switch flips for good.
//
// Ctrl or Cmd with the wheel, or a pinch, zooms one level per step at the pointer. Dragging pans. Plain scrolling is
// left to the page.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import { shapeOf } from '../../types-shape.ts';
import { word } from '../../words.ts';
import type { ViewOptions } from './view-options.ts';
import { sceneOf, type Scene } from '../../render/render-scene.ts';
import { roomsOf, type Spot } from '../../render/render-rooms.ts';
import { detailAt, roomSizes } from '../../render/render-detail.ts';
import { DARK, LIGHT } from '../../render/render-look.ts';
import { marksOf, type View } from '../../render/render-marks.ts';
import { fitView, panView, stepView, stopsOf } from '../../render/render-camera.ts';
import { paintCanvas, type Canvas2d } from '../../render/paint-canvas.ts';

/** The least time between two zoom steps, in milliseconds, so one swipe of a trackpad is one step. */
export const STEP_MS = 160;

/** Whether `drawing` has levels for the new rendering to show: more than one, so more than a flat list. */
export function hasLevels(drawing: GraphDrawing, g?: Graph): boolean {
  return sceneOf(shapeOf(drawing, g)).depths.length > 1;
}

/** The stage for a card, when its setting is on and its graph has levels to show; else none. */
export function stageFor(
  viewport: HTMLElement,
  o: Pick<ViewOptions, 'aids' | 'reading' | 'graph'>,
): RenderStage | null {
  const drawing = o.reading.graphs.get(o.graph),
    g = o.reading.world[o.graph];
  return o.aids?.newRendering && drawing && hasLevels(drawing, g) ? new RenderStage(viewport, drawing, g) : null;
}

/** One graph drawn by the new rendering, on a canvas over its card. */
export class RenderStage {
  readonly canvas: HTMLCanvasElement;
  private readonly scene: Scene;
  private readonly spots: Map<string, Spot>;
  private readonly sizes: number[];
  private stops: number[] = [];
  private view: View;
  private lastStep = -Infinity;
  private drag: { x: number; y: number } | null = null;
  private readonly watcher: ResizeObserver | null;

  private readonly viewport: HTMLElement;

  constructor(viewport: HTMLElement, drawing: GraphDrawing, g?: Graph) {
    this.viewport = viewport;
    this.scene = sceneOf(shapeOf(drawing, g));
    this.spots = roomsOf(this.scene);
    this.sizes = roomSizes(this.scene, this.spots);
    viewport.addClass('thoughtknot-new-rendering');
    this.canvas = viewport.createEl('canvas', { cls: 'thoughtknot-render-stage' });
    this.canvas.setAttribute('role', 'img');
    this.view = this.fitted();
    this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', () => (this.drag = null));
    this.watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resized());
    this.watcher?.observe(viewport);
    this.draw();
  }

  /** The level shown now, as a reader is told it: "Level 2 of 3 · Areas". */
  level(): string {
    const { level } = detailAt(this.sizes, this.view.scale);
    return word('levels.badge', {
      at: level + 1,
      count: this.scene.depths.length,
      name: this.scene.depths[level] ?? '',
    });
  }

  /** The drawing fitted to the card as it is now, and the zoom stops from there. */
  private fitted(): View {
    const r = this.viewport.getBoundingClientRect();
    const view = fitView(this.spots.values(), r.width || 1, r.height || 1);
    this.stops = stopsOf(this.sizes, view.scale);
    return view;
  }

  /** The card changed size: fitted again, as a change of size is not a change of place the reader made. */
  resized(): void {
    this.view = this.fitted();
    this.draw();
  }

  /** One zoom step for a wheel notch with Ctrl or Cmd, or a pinch; plain scrolling is the page's. */
  wheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const now = Date.now();
    if (now - this.lastStep < STEP_MS || !e.deltaY) return;
    this.lastStep = now;
    const r = this.canvas.getBoundingClientRect();
    this.view = stepView(this.view, this.stops, e.deltaY < 0 ? 1 : -1, [e.clientX - r.left, e.clientY - r.top]);
    this.draw();
  }

  private down(e: PointerEvent): void {
    this.drag = { x: e.clientX, y: e.clientY };
  }

  private move(e: PointerEvent): void {
    if (!this.drag) return;
    this.view = panView(this.view, e.clientX - this.drag.x, e.clientY - this.drag.y);
    this.drag = { x: e.clientX, y: e.clientY };
    this.draw();
  }

  /** Paints a whole new frame, at the device's own pixels. */
  draw(): void {
    const { w, h } = this.view;
    const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    this.canvas.setAttribute('aria-label', this.level());
    const c = this.canvas.getContext?.('2d') as (CanvasRenderingContext2D & Canvas2d) | null | undefined;
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    const dark = activeDocument.body.classList.contains('theme-dark');
    const marks = marksOf(
      this.scene,
      this.spots,
      detailAt(this.sizes, this.view.scale),
      dark ? DARK : LIGHT,
      this.view,
    );
    paintCanvas(c, marks, w, h);
  }

  /** Takes the canvas away and shows today's drawing again. */
  unload(): void {
    this.watcher?.disconnect();
    this.canvas.remove();
    this.viewport.removeClass('thoughtknot-new-rendering');
  }
}
