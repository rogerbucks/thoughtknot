// The new rendering's mini-map (editor spec §24, mini_map; Roger, 7 Nov 2026: the mini-map should look like the
// drawing, not a heap of squares). It paints the whole drawing as the overview does: each subject's cloud in its
// colour, and the roads between them. The part in view is outlined. A press or a drag on it moves the view there, at
// the same zoom. It lays nothing out and moves no thing: it paints the stage's own rooms smaller.
import { word } from '../../words.ts';
import type { Scene } from '../../render/render-scene.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { Look } from '../../render/render-look.ts';
import { marksOf, type Mark, type OwnColour, type View } from '../../render/render-marks.ts';
import { detailAt } from '../../render/render-detail.ts';
import { fitView } from '../../render/render-camera.ts';
import { paintCanvas, type Canvas2d } from '../../render/paint-canvas.ts';

/** The copy's size in pixels when the style sheet gives it none. */
const WIDE = 160;
const HIGH = 120;

/** What the mini-map reads from its stage, and the one thing it asks of it. */
export interface MiniHost {
  scene: Scene;
  spots: Map<string, Spot>;
  sizes: readonly number[];
  look: () => Look;
  own?: OwnColour;
  /** Whether it shows only while the drawing does not fit its view: the setting's auto, or a card too small. */
  auto?: () => boolean;
  /** The stage's view now. */
  view: () => View;
  /** Shows the drawing's point `x`, `y` in the middle of the view, at the same zoom. */
  lookAt: (x: number, y: number) => void;
}

/** The mini-map of one stage. */
export class StageMiniMap {
  readonly canvas: HTMLCanvasElement;
  private readonly host: MiniHost;
  /** The copy's own view of the whole drawing, from the last paint. */
  private whole: View | null = null;
  private drag: number | null = null;

  constructor(viewport: HTMLElement, host: MiniHost) {
    this.host = host;
    // one of the cards over the drawing, in its corner slot, so the drawing and the names keep clear of it
    this.canvas = viewport.createEl('canvas', {
      cls: 'thoughtknot-mini-map thoughtknot-stage-mini',
      attr: { role: 'img', 'aria-label': word('drawing.mini-map') },
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.stopPropagation();
      e.preventDefault();
      this.drag = e.pointerId;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.moveTo(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag === e.pointerId) this.moveTo(e);
    });
    const end = (e: PointerEvent): void => {
      if (this.drag === e.pointerId) this.drag = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** The copy's size on screen, as the style sheet sets it. */
  private size(): { w: number; h: number } {
    const r = this.canvas.getBoundingClientRect?.();
    return { w: Math.round(r?.width || WIDE), h: Math.round(r?.height || HIGH) };
  }

  /** Paints the whole drawing small, and outlines the part the stage shows now. */
  draw(): void {
    const { scene, spots, sizes } = this.host;
    const { w, h } = this.size();
    const whole = fitView(spots.values(), w, h);
    this.whole = whole;
    const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    const look = this.host.look();
    // the overview's clouds, patches, tiles and roads, without names: too small to read at this size
    const marks: Mark[] = marksOf(scene, spots, detailAt(sizes, whole.scale), look, whole, this.host.own).flatMap(
      (m): Mark[] =>
        m.kind === 'cloud' || m.kind === 'area'
          ? [m]
          : m.kind === 'backdrop'
            ? [{ ...m, words: [] }]
            : m.kind === 'road'
              ? [{ ...m, count: '', width: Math.min(m.width, 2) }]
              : [],
    );
    const f = this.frame();
    this.canvas.hidden = !!this.host.auto?.() && this.fits();
    const c = this.canvas.getContext?.('2d') as (CanvasRenderingContext2D & Canvas2d) | null | undefined;
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintCanvas(c, marks, w, h);
    c.globalAlpha = 1;
    c.strokeStyle = look.ink;
    c.lineWidth = 1.5;
    c.strokeRect(f.x, f.y, f.w, f.h);
  }

  /** Whether the stage's view holds every room of the drawing: the drawing fits its view. */
  private fits(): boolean {
    const v = this.host.view();
    for (const s of this.host.spots.values())
      if (
        (s.x - s.r - v.x) * v.scale < -0.5 ||
        (s.y - s.r - v.y) * v.scale < -0.5 ||
        (s.x + s.r - v.x) * v.scale > v.w + 0.5 ||
        (s.y + s.r - v.y) * v.scale > v.h + 0.5
      )
        return false;
    return true;
  }

  /** The part in view, on the copy. */
  frame(): { x: number; y: number; w: number; h: number } {
    const v = this.host.view(),
      m = this.whole ?? v;
    const k = m.scale / v.scale;
    return { x: (v.x - m.x) * m.scale, y: (v.y - m.y) * m.scale, w: v.w * k, h: v.h * k };
  }

  /** Moves the view so the point pressed on the copy is in its middle. */
  moveTo(e: { clientX: number; clientY: number }): void {
    const m = this.whole;
    if (!m) return;
    const r = this.canvas.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    this.host.lookAt(m.x + (e.clientX - r.left) / m.scale, m.y + (e.clientY - r.top) / m.scale);
  }

  remove(): void {
    this.canvas.remove();
  }
}
