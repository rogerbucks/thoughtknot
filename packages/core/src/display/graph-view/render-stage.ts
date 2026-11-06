// The stage of the new rendering (editor spec §73, render_switch; wiki/Rendering-spec.md). With the "New rendering"
// setting on, a graph is drawn here, on one canvas over the card, by the layers one way down. The scene, rooms, detail,
// marks and canvas painter do the work, and this file only wires them to the page. Today's SVG stays underneath,
// hidden, so the old path keeps working until the switch flips for good.
//
// Ctrl or Cmd with the wheel, or a pinch on a trackpad or touch screen, zooms one level per step at the pointer.
// Dragging pans. Plain scrolling is left to the page. A click picks from the marks (layer L6). An item's first click selects it and opens its details.
// Its second glides it to the middle (second_tap_centres). A click on a group glides to it and opens its next level.
// A click on empty space clears the selection.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import { shapeOf } from '../../types-shape.ts';
import { word } from '../../words.ts';
import type { ViewOptions } from './view-options.ts';
import { sceneOf, type Scene } from '../../render/render-scene.ts';
import { roomsOf, type Spot } from '../../render/render-rooms.ts';
import { detailAt, roomSizes } from '../../render/render-detail.ts';
import { DARK, LIGHT } from '../../render/render-look.ts';
import { marksOf, type Mark, type View } from '../../render/render-marks.ts';
import { centreOn, fitView, glideView, panView, pickAt, stepView, stopsOf } from '../../render/render-camera.ts';
import { paintCanvas, type Canvas2d } from '../../render/paint-canvas.ts';
import { coverCards, overCover } from './controls-cover.ts';

/** The least time between two zoom steps, in milliseconds, so one swipe of a trackpad is one step. */
export const STEP_MS = 160;
/** How long a glide to a picked thing takes, in milliseconds. */
export const GLIDE_MS = 260;
/** How far a pointer may move, in pixels, and still be a click rather than a drag. */
const CLICK_PX = 6;
/** How much two fingers must spread, as a ratio, to step one level: one level per clear pinch. */
const PINCH = 1.25;

/** What a click on the stage does in its card: choose a thing (its details open), or clear the choice. */
export interface StageHands {
  open: (key: string) => void;
  clear: () => void;
  /** The thing chosen now, by its key. */
  selected: () => string | null;
}

/** Whether `drawing` has levels for the new rendering to show: more than one, so more than a flat list. */
export function hasLevels(drawing: GraphDrawing, g?: Graph): boolean {
  return sceneOf(shapeOf(drawing, g)).depths.length > 1;
}

/** The stage for a card, when its setting is on and its graph has levels to show; else none. */
export function stageFor(
  viewport: HTMLElement,
  o: Pick<ViewOptions, 'aids' | 'reading' | 'graph'>,
  hands?: StageHands,
): RenderStage | null {
  const drawing = o.reading.graphs.get(o.graph),
    g = o.reading.world[o.graph];
  return o.aids?.newRendering && drawing && hasLevels(drawing, g) ? new RenderStage(viewport, drawing, g, hands) : null;
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
  /** Whether the view is still the fitted one: no zoom or pan since. */
  private untouched = true;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  /** The fingers or pointers down now, by id, and the spread a pinch is measured from. */
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; x: number; y: number } | null = null;
  private readonly watcher: ResizeObserver | null;
  /** The marks painted last, which a click picks from. */
  private marks: Mark[] = [];
  private gliding = 0;

  private readonly viewport: HTMLElement;
  private readonly hands: StageHands | undefined;

  constructor(viewport: HTMLElement, drawing: GraphDrawing, g?: Graph, hands?: StageHands) {
    this.viewport = viewport;
    this.hands = hands;
    this.scene = sceneOf(shapeOf(drawing, g));
    this.spots = roomsOf(this.scene);
    this.sizes = roomSizes(this.scene, this.spots);
    viewport.addClass('thoughtknot-new-rendering');
    this.canvas = viewport.createEl('canvas', { cls: 'thoughtknot-render-stage' });
    this.canvas.setAttribute('role', 'img');
    this.view = this.fitted();
    // caught on the way down, so today's zoom underneath never takes the same notch
    viewport.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.lift(e));
    this.watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resized());
    this.watcher?.observe(viewport);
    for (const card of coverCards(viewport)) this.watcher?.observe(card);
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

  /** The drawing fitted to the part of the card the controls leave clear, and the zoom stops from there. */
  private fitted(): View {
    const r = this.viewport.getBoundingClientRect();
    const view = fitView(this.spots.values(), r.width || 1, r.height || 1, overCover(this.viewport, r));
    this.stops = stopsOf(this.sizes, view.scale);
    this.untouched = true;
    return view;
  }

  /**
   * The card or a control changed size. A view the reader has not moved is fitted again. A moved one keeps its place
   * and only learns the new cover. A change of size is not a change of place the reader made.
   */
  resized(): void {
    if (this.untouched) this.view = this.fitted();
    else {
      const r = this.viewport.getBoundingClientRect();
      this.view = { ...this.view, clear: overCover(this.viewport, r) };
    }
    this.draw();
  }

  private readonly onWheel = (e: WheelEvent): void => this.wheel(e);

  /** One zoom step for a wheel notch with Ctrl or Cmd, or a pinch; plain scrolling is the page's. */
  wheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - this.lastStep < STEP_MS || !e.deltaY) return;
    this.lastStep = now;
    this.step(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  }

  /** One level nearer (1) or farther (-1), keeping the page point `x`, `y` where it is. */
  private step(by: 1 | -1, x: number, y: number): void {
    this.untouched = false;
    this.gliding++; // the reader's own zoom stops a glide under way
    const r = this.canvas.getBoundingClientRect();
    this.view = stepView(this.view, this.stops, by, [x - r.left, y - r.top]);
    this.draw();
  }

  private down(e: PointerEvent): void {
    // the press is the stage's own: today's drawing underneath would take the pointer and the click would be lost
    e.stopPropagation();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.fingers.size === 2) {
      // a second finger: a pinch, never a pan or a tap
      this.drag = null;
      this.pinch = this.spread();
    } else if (this.fingers.size === 1) this.drag = { x: e.clientX, y: e.clientY, moved: false };
  }

  /** How far apart the two fingers are, and the point between them, in page pixels. */
  private spread(): { d: number; x: number; y: number } {
    const [a, b] = [...this.fingers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private move(e: PointerEvent): void {
    if (this.fingers.has(e.pointerId)) this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.fingers.size === 2) {
      // fingers spread by a quarter step one level in, drawn together by a fifth step one out
      const now = this.spread(),
        k = now.d / this.pinch.d;
      if (k >= PINCH || k <= 1 / PINCH) {
        this.step(k > 1 ? 1 : -1, now.x, now.y);
        this.pinch = now;
      }
      return;
    }
    const d = this.drag;
    if (!d || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_PX)) return;
    this.view = panView(this.view, e.clientX - d.x, e.clientY - d.y);
    this.untouched = false;
    this.gliding++;
    this.drag = { x: e.clientX, y: e.clientY, moved: true };
    this.draw();
  }

  private up(e: PointerEvent): void {
    this.fingers.delete(e.pointerId);
    if (this.fingers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved) return;
    const r = this.canvas.getBoundingClientRect();
    this.clicked(e.clientX - r.left, e.clientY - r.top);
  }

  /** A finger taken away without a tap, as when the system takes the touch. */
  private lift(e: PointerEvent): void {
    this.fingers.delete(e.pointerId);
    if (this.fingers.size < 2) this.pinch = null;
    this.drag = null;
  }

  /** A click at `x`, `y` on the canvas: what it picks is chosen, glided to, or opened. */
  clicked(x: number, y: number): void {
    const key = pickAt(this.marks, x, y),
      node = key ? this.scene.nodes.get(key) : undefined,
      spot = key ? this.spots.get(key) : undefined;
    if (!key || !spot) return this.hands?.clear();
    const last = this.scene.depths.length - 1;
    if (node && node.depth < last) {
      // a group: glide to it, one level nearer, so what is in it opens
      const next = this.stops.find((s) => s > this.view.scale * 1.01) ?? this.view.scale;
      return this.glideTo(centreOn(this.view, spot, next));
    }
    if (this.hands?.selected() === key) this.glideTo(centreOn(this.view, spot));
    else this.hands?.open(key);
  }

  /** Glides to `to`, or goes there at once when the reader asks for less motion (rule 7). */
  private glideTo(to: View): void {
    this.untouched = false;
    const from = this.view,
      win = this.viewport.win ?? (typeof window === 'undefined' ? undefined : window);
    const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still || !win?.requestAnimationFrame) {
      this.view = to;
      return this.draw();
    }
    const run = ++this.gliding,
      start = Date.now();
    const frame = () => {
      if (run !== this.gliding) return;
      const t = Math.min(1, (Date.now() - start) / GLIDE_MS);
      this.view = t < 1 ? glideView(from, to, t) : to;
      this.draw();
      if (t < 1) win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
  }

  /** Paints a whole new frame, at the device's own pixels. */
  draw(): void {
    const { w, h } = this.view;
    const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    this.canvas.setAttribute('aria-label', this.level());
    const dark = activeDocument.body.classList.contains('theme-dark');
    this.marks = marksOf(this.scene, this.spots, detailAt(this.sizes, this.view.scale), dark ? DARK : LIGHT, this.view);
    const c = this.canvas.getContext?.('2d') as (CanvasRenderingContext2D & Canvas2d) | null | undefined;
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintCanvas(c, this.marks, w, h);
  }

  /** Takes the canvas away and shows today's drawing again. */
  unload(): void {
    this.viewport.removeEventListener('wheel', this.onWheel, { capture: true });
    this.watcher?.disconnect();
    this.canvas.remove();
    this.viewport.removeClass('thoughtknot-new-rendering');
  }
}
