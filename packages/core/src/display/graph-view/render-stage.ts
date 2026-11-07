// The stage of the new rendering (editor spec §73, render_switch; wiki/Rendering-spec.md). With its setting on, a graph
// is drawn here, on one canvas over the card, by the layers one way down. Today's SVG stays underneath, hidden.
// Ctrl or Cmd with the wheel, or a pinch on a trackpad or touch screen, zooms smoothly at the pointer (Roger, 6 Nov).
// Dragging pans. Plain scrolling is left to the page. A click picks from the marks (layer L6). An item's first click
// selects it and opens its details. Its second glides it to the middle (second_tap_centres). A click on a group glides
// to it and opens its next level. A click on empty space clears the selection.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import { shapeOf } from '../../types-shape.ts';
import { word } from '../../words.ts';
import type { ViewOptions } from './view-options.ts';
import { sceneOf, type Scene } from '../../render/render-scene.ts';
import { roomsOf, type Spot } from '../../render/render-rooms.ts';
import { detailAt, roomSizes } from '../../render/render-detail.ts';
import { DARK, LIGHT } from '../../render/render-look.ts';
import { coloursOf, marksOf, type Mark, type OwnColour, type View } from '../../render/render-marks.ts';
import { centreOn, fitView, panView, pickAt, pinchView, stopsOf, wheelView } from '../../render/render-camera.ts';
import { paintCanvas, type Canvas2d } from '../../render/paint-canvas.ts';
import { groundShift, isTilted, turnedBy } from '../../render/render-tilt.ts';
import { coverCards, overCover } from './controls-cover.ts';
import { angleOf, glide } from './stage-glide.ts';
import { StageFocus, pickRoad } from './stage-focus.ts';
import { StageMiniMap } from './stage-mini-map.ts';
import { StageMover, type PlacesHost } from './stage-places.ts';
import type { MiniMapSetting } from '../../settings-aids.ts';

export { GLIDE_MS } from './stage-glide.ts';
/** How far a pointer may move, in pixels, and still be a click rather than a drag. */
const CLICK_PX = 6;

/** What a click on the stage does in its card: choose a thing (its details open), or clear the choice. */
export interface StageHands {
  open: (key: string) => void;
  clear: () => void;
  /** The thing chosen now, by its key. */
  selected: () => string | null;
  /** Whether another view shows in the card now, as in space, so the stage leaves the pointer and wheel to it. */
  away?: () => boolean;
  /** Told after each drawing, so the level badge and its colour key say the level shown now. */
  drawn?: () => void;
  /** The colour each subject was given on the colour key, if any, so the drawing and its key agree. */
  own?: OwnColour;
}

/** Whether `drawing` has levels for the new rendering to show: more than one, so more than a flat list. */
export function hasLevels(drawing: GraphDrawing, g?: Graph): boolean {
  return sceneOf(shapeOf(drawing, g)).depths.length > 1;
}

/** The stage for a card, when its setting is on and its graph has levels to show; else none. */
export function stageFor(
  viewport: HTMLElement,
  o: Pick<ViewOptions, 'aids' | 'reading' | 'graph' | 'places'>,
  hands?: StageHands,
): RenderStage | null {
  const drawing = o.reading.graphs.get(o.graph),
    g = o.reading.world[o.graph];
  if (!o.aids?.newRendering || !drawing || !hasLevels(drawing, g)) return null;
  return new RenderStage(viewport, drawing, g, hands, o.aids.miniMap, o.places);
}

/** One graph drawn by the new rendering, on a canvas over its card. */
export class RenderStage {
  readonly canvas: HTMLCanvasElement;
  private readonly scene: Scene;
  private readonly spots: Map<string, Spot>;
  private readonly sizes: number[];
  private stops: number[] = [];
  private view: View;
  /** Whether the view is still the fitted one: no zoom or pan since. */
  private untouched = true;
  private drag: { x: number; y: number; moved: boolean; turning?: boolean; moving?: boolean } | null = null;
  /** The fingers or pointers down now, by id, and the spread a pinch is measured from. */
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; x: number; y: number } | null = null;
  private readonly watcher: ResizeObserver | null;
  /** The marks painted last, which a click picks from. */
  private marks: Mark[] = [];
  private gliding = 0;
  private readonly mover: StageMover | undefined;
  private readonly focus = new StageFocus(() => this.draw());

  private readonly viewport: HTMLElement;
  private readonly hands: StageHands | undefined;
  /** The whole drawing small, in its corner, in the drawing's own look (Roger, 7 Nov 2026). */
  readonly mini: StageMiniMap | null;
  /** The level the hands were last told, so they hear only of a change. */
  private said = '';
  /** The card is too small for the drawing, the controls and the mini-map: the mini-map waits for a zoom. */
  private cramped = false;

  constructor(
    viewport: HTMLElement,
    drawing: GraphDrawing,
    g?: Graph,
    hands?: StageHands,
    mini: MiniMapSetting = 'always',
    places?: PlacesHost,
  ) {
    this.viewport = viewport;
    this.hands = hands;
    this.scene = sceneOf(shapeOf(drawing, g));
    this.spots = roomsOf(this.scene, places?.saved);
    // an item dragged is moved, and its place saved in the layout block (layout_drag_saves)
    const live = { viewport, scene: this.scene, spots: this.spots, marks: () => this.marks, view: () => this.view };
    this.mover = places?.place && new StageMover({ ...live, draw: () => this.draw() }, places);
    this.sizes = roomSizes(this.scene, this.spots);
    viewport.addClass('thoughtknot-new-rendering');
    this.canvas = viewport.createEl('canvas', { cls: 'thoughtknot-render-stage' });
    this.canvas.setAttribute('role', 'img');
    // what was painted last, as data, for the scoreboard to count (scripts/render-measure.mjs); nothing reads it back
    Object.defineProperty(this.canvas, 'thoughtknotDrawn', { value: () => ({ marks: this.marks, view: this.view }) });
    // none while the mini-map setting is off; on auto, shown only while the drawing does not fit (mini_map_setting)
    this.mini =
      mini === 'off'
        ? null
        : new StageMiniMap(viewport, {
            auto: () => mini === 'auto' || this.cramped,
            scene: this.scene,
            spots: this.spots,
            sizes: this.sizes,
            look: () => this.look(),
            own: (key) => this.hands?.own?.(key),
            view: () => this.view,
            lookAt: (x, y) => {
              this.untouched = false;
              this.gliding++; // a press on the copy stops a glide under way, as the reader's own zoom does
              this.view = centreOn(this.view, { x, y, r: 0 });
              this.draw();
            },
          });
    this.view = this.fitted();
    viewport.addEventListener('wheel', this.onWheel, { passive: false, capture: true }); // before today's zoom
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.lift(e));
    this.focus.watch(this.canvas, () => ({ marks: this.marks, busy: !!this.drag || this.fingers.size > 0 }));
    // seen from an angle, a right drag turns the camera: no menu comes up for it
    this.canvas.addEventListener('contextmenu', (e) => isTilted(this.view) && e.preventDefault());
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
    const fit = () => {
      const cover = overCover(this.viewport, r);
      const view = fitView(this.spots.values(), r.width || 1, r.height || 1, cover);
      return { view, roomy: view.clear === cover };
    };
    // measured with the mini-map shown, so the answer is the same however the last fit left it
    if (this.mini) this.mini.canvas.hidden = false;
    let { view, roomy } = fit();
    // too little room left clear with the mini-map shown: it waits until the reader zooms in, and the controls count
    this.cramped = !roomy && !!this.mini;
    if (this.cramped && this.mini) {
      this.mini.canvas.hidden = true;
      view = fit().view;
    }
    // a fit keeps the angle the camera looks from: 2.5D stays 2.5D
    const { tilt, turn, lift } = this.view ?? {};
    if (tilt || turn) Object.assign(view, { tilt: tilt ?? 0, turn: turn ?? 0, lift: lift ?? 0 });
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

  /** Whether another view, as in space, shows in the card now: then the stage leaves the pointer and wheel to it. */
  private away(): boolean {
    return !!this.hands?.away?.();
  }

  /** A smooth zoom for the wheel with Ctrl or Cmd, as a trackpad pinch sends it; plain scrolling is the page's. */
  wheel(e: WheelEvent): void {
    if ((!e.ctrlKey && !e.metaKey) || this.away()) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY) this.zoom((v, at) => wheelView(v, this.stops, e.deltaY, at), e.clientX, e.clientY);
  }

  /** Zooms by `how`, keeping the page point `x`, `y` where it is. */
  private zoom(how: (v: View, at: [number, number]) => View, x: number, y: number): void {
    this.untouched = false;
    this.gliding++; // the reader's own zoom stops a glide under way
    const r = this.canvas.getBoundingClientRect();
    this.view = how(this.view, [x - r.left, y - r.top]);
    this.draw();
  }

  private down(e: PointerEvent): void {
    if (this.away()) return;
    // the press is the stage's own: today's drawing underneath would take the pointer and the click would be lost
    e.stopPropagation();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.fingers.size === 2) {
      // a second finger: a pinch, never a pan or a tap
      this.drag = null;
      this.pinch = this.spread();
    } else if (this.fingers.size === 1) {
      // seen from an angle, a drag with Shift or the right button turns and tips the camera; else it moves the drawing
      const turning = isTilted(this.view) && (e.shiftKey || e.button === 2),
        r = this.canvas.getBoundingClientRect();
      const moving = !turning && !!this.mover?.grab(e.clientX - r.left, e.clientY - r.top);
      this.drag = { x: e.clientX, y: e.clientY, moved: false, turning, moving };
    }
  }

  /** How far apart the two fingers are, and the point between them, in page pixels. */
  private spread(): { d: number; x: number; y: number } {
    const [a, b] = [...this.fingers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private move(e: PointerEvent): void {
    if (this.fingers.has(e.pointerId)) this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.fingers.size === 2) {
      // the drawing follows the fingers: it zooms as they spread or draw together, and pans as they move
      const was = this.pinch,
        now = this.spread();
      this.view = panView(this.view, ...groundShift(this.view, now.x - was.x, now.y - was.y));
      this.zoom((v, at) => pinchView(v, this.stops, now.d / was.d, at), now.x, now.y);
      this.pinch = now;
      return;
    }
    const d = this.drag;
    if (!d || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_PX)) return;
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    if (d.moving) this.mover?.drag(dx, dy);
    else if (d.turning) this.view = turnedBy(this.view, dx, dy);
    else this.view = panView(this.view, ...groundShift(this.view, dx, dy));
    this.untouched = false;
    this.gliding++;
    this.drag = { ...d, x: e.clientX, y: e.clientY, moved: true };
    this.draw();
  }

  private up(e: PointerEvent): void {
    this.fingers.delete(e.pointerId);
    if (this.fingers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (d?.moving) this.mover?.drop();
    if (!d || d.moved) return;
    const r = this.canvas.getBoundingClientRect();
    this.clicked(e.clientX - r.left, e.clientY - r.top);
  }

  /** A finger taken away without a tap, as when the system takes the touch. */
  private lift(e: PointerEvent): void {
    this.fingers.delete(e.pointerId);
    if (this.fingers.size < 2) this.pinch = null;
    if (this.drag?.moving) this.mover?.drop();
    this.drag = null;
  }

  /** A click at `x`, `y` on the canvas: what it picks is chosen, glided to, or opened. */
  clicked(x: number, y: number): void {
    const key = pickAt(this.marks, x, y),
      node = key ? this.scene.nodes.get(key) : undefined,
      spot = key ? this.spots.get(key) : undefined;
    // a click on a road chooses it, and a click on anything else lets it go
    const road = this.focus.choose(key ? null : pickRoad(this.marks, x, y));
    if (!key || !spot) return road ? undefined : this.hands?.clear();
    // a signpost names a room off screen: glide there at the same zoom, so the reader sees where they went
    const on = { x: (spot.x - this.view.x) * this.view.scale, y: (spot.y - this.view.y) * this.view.scale };
    if (on.x < 0 || on.y < 0 || on.x > this.view.w || on.y > this.view.h)
      return this.glideTo(centreOn(this.view, spot));
    const last = this.scene.depths.length - 1;
    if (node && node.depth < last) {
      // a group: glide to it, one level nearer, so what is in it opens
      const next = this.stops.find((s) => s > this.view.scale * 1.01) ?? this.view.scale;
      return this.glideTo(centreOn(this.view, spot, next));
    }
    if (this.hands?.selected() === key) return this.glideTo(centreOn(this.view, spot));
    this.hands?.open(key);
    this.draw(); // chosen, its links show at once
  }

  /**
   * Looks at the drawing as the bar's 2D button says (space_one_bar). 2.5D and 3D tip the camera back over the same
   * marks, and flat looks straight down. Says whether the stage shows it. The globe is left to the view in space.
   */
  lookFrom(mode: string | null): boolean {
    const angle = angleOf(mode);
    if (!angle) return ((this.view = { ...this.view, tilt: 0, turn: 0, lift: 0 }), false);
    const { tilt, lift } = angle;
    if ((this.view.tilt ?? 0) === tilt && (this.view.lift ?? 0) === lift) return true; // already there: nothing to glide
    const untouched = this.untouched;
    this.glideTo({ ...this.view, tilt, turn: this.view.turn ?? 0, lift });
    this.untouched = untouched; // looking from another angle is not a move the reader made
    return true;
  }

  /** Turns and tips a tilted camera, as a drag of `dx`, `dy` pixels would; says whether it could (flat, it cannot). */
  turnBy(dx: number, dy: number): boolean {
    if (!isTilted(this.view)) return false;
    this.view = turnedBy(this.view, dx, dy);
    this.draw();
    return true;
  }

  /** Glides to `to`, or goes there at once when the reader asks for less motion (rule 7). */
  private glideTo(to: View): void {
    this.untouched = false;
    const run = ++this.gliding,
      win = this.viewport.win ?? (typeof window === 'undefined' ? undefined : window);
    glide(
      win,
      this.view,
      to,
      (v) => ((this.view = v), this.draw()),
      () => run === this.gliding,
    );
  }

  /** Paints a whole new frame, at the device's own pixels. */
  draw(): void {
    const { w, h } = this.view;
    const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    const detail = detailAt(this.sizes, this.view.scale);
    const focus = this.focus.of(this.hands?.selected());
    this.marks = marksOf(this.scene, this.spots, detail, this.look(), this.view, this.hands?.own, focus);
    const level = this.level();
    this.canvas.setAttribute('aria-label', level);
    if (level !== this.said) this.hands?.drawn?.();
    // the level badge comes with the first drawing, so the cover cards are watched again (render_chrome_slots)
    if (level !== this.said) for (const card of coverCards(this.viewport)) this.watcher?.observe(card);
    this.said = level;
    this.mini?.draw();
    const c = this.canvas.getContext?.('2d') as (CanvasRenderingContext2D & Canvas2d) | null | undefined;
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintCanvas(c, this.marks, w, h);
  }

  /** The look of the theme shown now. */
  private look(): typeof LIGHT {
    return activeDocument.body.classList.contains('theme-dark') ? DARK : LIGHT;
  }

  /** The colour the drawing gives `key` now, so the colour key shows the same one (Roger, 7 Nov 2026). */
  colourOf(key: string): string | undefined {
    return coloursOf(this.scene, this.look(), this.hands?.own).get(key);
  }

  /** Takes the canvas away and shows today's drawing again. */
  unload(): void {
    this.gliding++; // a glide still running stops with the stage
    this.mover?.unload();
    this.focus.cancel();
    this.viewport.removeEventListener('wheel', this.onWheel, { capture: true });
    this.watcher?.disconnect();
    this.canvas.remove();
    this.mini?.remove();
    this.viewport.removeClass('thoughtknot-new-rendering');
  }
}
