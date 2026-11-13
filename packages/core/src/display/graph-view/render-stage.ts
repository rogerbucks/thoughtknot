// The stage of the new rendering (editor spec §73, render_switch; wiki/Rendering-spec.md). With its setting on, a graph
// is drawn here, on one canvas over the card, by the layers one way down. Today's SVG stays underneath, hidden.
// Ctrl or Cmd with the wheel, or a pinch on a trackpad or touch screen, zooms smoothly at the pointer (Roger, 6 Nov).
// Dragging pans. Plain scrolling is left to the page. A click picks from the marks (layer L6). An item's first click
// selects it and opens its details. Its second glides it to the middle (second_tap_centres). A group opens like a
// folder: picked first, then opened (stage-rooms.ts). A click on empty space clears the selection.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import type { Scene } from '../../render/render-scene.ts';
import type { Spot } from '../../render/render-rooms.ts';
import { detailAt, roomSizes } from '../../render/render-detail.ts';
import { DARK, LIGHT } from '../../render/render-look.ts';
import { coloursOf, marksOf, type Mark, type View } from '../../render/render-marks.ts';
import { centreOn, fitView, panView, pickAt, pinchView, stopsOf, wheelView } from '../../render/render-camera.ts';
import { paintCanvas, type Canvas2d } from '../../render/paint-canvas.ts';
import { fromTrackpad, groundShift, isTilted, onScreen, turnedBy } from '../../render/render-tilt.ts';
import { aroundAgain, ballFitted, isGlobe, middleOf } from '../../render/render-globe.ts';
import { flatOf, laidOut, lookedFrom, sameLook, turnedView } from './stage-look.ts';
import type { StageKind } from './stage-look.ts';
import { morphIn, seenOf, type Seen } from './stage-morph.ts';
import { coverCards, overCover } from './controls-cover.ts';
import { glide } from './stage-glide.ts';
import { StageFocus, pickRoad } from './stage-focus.ts';
import { FaintRoads } from './stage-faint.ts';
import { StageMiniMap } from './stage-mini-map.ts';
import { StageMover, type PlacesHost } from './stage-places.ts';
import type { MiniMapSetting } from '../../settings-aids.ts';
import { StageRooms } from './stage-rooms.ts';
import type { StageHands } from './stage-hands.ts';
import { StageCards, switchCards, type CardWords } from './stage-cards.ts';

export { GLIDE_MS } from './stage-glide.ts';
/** How far a pointer may move, in pixels, and still be a click rather than a drag. */
const CLICK_PX = 6;

export type { StageHands } from './stage-hands.ts';
export { hasLevels } from './stage-look.ts';
export { stageFor } from './render-stage-for.ts';
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
  /** Each item drawn as a card with its whole note, while Cards is on (render_cards). */
  private cards: StageCards | null = null;
  /** Brings a Cards glide still under way to rest at once. */
  private stopCards = (): void => {};
  /** What the host gives the cards to show: its own Markdown rendering, and linked notes. */
  cardWords?: CardWords;
  private readonly drawing: GraphDrawing;
  private readonly g: Graph | undefined;
  private readonly focus = new StageFocus(() => this.draw());
  /** The room picked and the room open: the badge's way in, and its Back (render_room_folders). */
  readonly rooms: StageRooms;
  private readonly faint = new FaintRoads({ viewport: () => this.viewport, changed: () => this.draw() });

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
    kind: StageKind = 'network',
    seen?: Seen,
  ) {
    [this.viewport, this.drawing, this.g] = [viewport, drawing, g];
    ({ scene: this.scene, spots: this.spots, hands: this.hands } = laidOut(drawing, g, kind, hands, places?.saved));
    // an item dragged is moved, and its place saved in the layout block (layout_drag_saves)
    const live = { viewport, scene: this.scene, spots: this.spots, marks: () => this.marks, view: () => this.view };
    this.mover = places?.place && new StageMover({ ...live, draw: () => this.draw() }, places);
    this.sizes = roomSizes(this.scene, this.spots);
    this.rooms = new StageRooms({ ...live, sizes: this.sizes, hands: this.hands, stage: this });
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
    viewport.addEventListener('keydown', this.onKey);
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
    morphIn(this.spots, this.view, seen, () => this.draw()); // from the type shown before, if any (render_type_morph)
  }
  /** What this stage shows now, for the stage that takes its place when the diagram type changes. */
  readonly seen = (): Seen => seenOf(this.view, this.spots);

  /** Where the reader is, as the badge says it: the way into the room open, as "All › Core" (render_room_folders). */
  level(): string {
    return this.rooms.crumbs();
  }

  /** The drawing fitted to the part of the card the controls leave clear, and the zoom stops from there. */
  fitted(): View {
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
    // a fit keeps the angle the camera looks from: 2.5D stays 2.5D, and the globe a globe
    const { tilt, turn, lift, globe } = this.view ?? {};
    if (tilt || turn || globe) view = ballFitted(Object.assign(view, { tilt, turn, lift, globe }));
    this.stops = stopsOf(this.sizes, view.scale);
    this.untouched = true;
    return view;
  }

  /** The card or a control changed size: an unmoved view is fitted again, a moved one only learns the new cover. */
  resized(): void {
    if (this.untouched) this.view = this.fitted();
    else {
      const r = this.viewport.getBoundingClientRect();
      this.view = { ...this.view, clear: overCover(this.viewport, r) };
    }
    this.draw();
  }

  private readonly onWheel = (e: WheelEvent): void => this.wheel(e);
  private readonly onKey = (e: KeyboardEvent): void => this.rooms.key(e);

  /**
   * A smooth zoom for a mouse wheel with no key held, and for a trackpad pinch, which comes as Ctrl or Cmd and the wheel.
   * The wheel with Alt or Option, and two fingers dragged on a trackpad, scroll the page (note_still_scrolls).
   */
  wheel(e: WheelEvent): void {
    const pad = !e.ctrlKey && !e.metaKey && fromTrackpad(e);
    // seen from an angle, two fingers on a trackpad turn the view side to side and tip it up and down (Roger)
    if (this.hands?.away?.() || e.altKey || this.cards?.scrolls(e) || (pad && !this.turnBy(-e.deltaX, -e.deltaY)))
      return;
    e.preventDefault();
    e.stopPropagation();
    if (!pad && e.deltaY) this.zoom((v, at) => wheelView(v, this.stops, e.deltaY, at), e.clientX, e.clientY);
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
    if (this.hands?.away?.()) return; // another view, as in space, shows in the card: the pointer is its own
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
      const moving = !turning && !this.cards && !!this.mover?.grab(e.clientX - r.left, e.clientY - r.top);
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
    // a click on the room open, or a room round it, is a click on its empty floor
    const at = this.cards?.pickAt(x, y) ?? pickAt(this.marks, x, y),
      key = at && !this.rooms.around(at) ? at : null,
      spot = key ? this.spots.get(key) : undefined;
    // a click on a road chooses it, and a click on anything else lets it go
    const road = this.focus.choose(key ? null : pickRoad(this.marks, x, y));
    if (!key || !spot) return road ? undefined : ((this.rooms.picked = null), this.hands?.clear(), this.draw());
    // a signpost names a room off screen: glide there at the same zoom, so the reader sees where they went
    const on = { x: (spot.x - this.view.x) * this.view.scale, y: (spot.y - this.view.y) * this.view.scale };
    const off = on.x < 0 || on.y < 0 || on.x > this.view.w || on.y > this.view.h;
    if (off || onScreen(spot, this.view).behind) return this.glideTo(centreOn(this.view, spot));
    if (this.rooms.isRoom(key)) return this.rooms.clicked(key); // the first click picks a room, the second opens it
    this.rooms.picked = null;
    // the second click centres it; on the globe the first turns it to face you too (Roger, 24 Oct 2026)
    const again = this.hands?.selected() === key;
    if (!again) this.hands?.open(key);
    if (again || isGlobe(this.view)) return this.glideTo(centreOn(this.view, spot));
    this.draw(); // chosen, its links show at once
  }

  /**
   * Looks at the drawing as the bar's 2D button says (space_one_bar). 2.5D and 3D tip the camera back over the same
   * marks. Flat looks straight down. The globe wraps them round a ball (stage-look.ts). Says whether it shows it.
   */
  lookFrom(mode: string | null): boolean {
    const to = lookedFrom(this.view, mode, this.spots.values());
    if (!to) return ((this.view = flatOf(this.view)), false);
    if (sameLook(this.view, to)) return true; // already there: nothing to glide
    const untouched = this.untouched;
    this.glideTo(to);
    this.untouched = untouched; // looking from another angle is not a move the reader made
    return true;
  }

  /** Turns a tilted camera or spins the globe, as a drag of `dx`, `dy` would; says whether it could (flat, it cannot). */
  turnBy(dx: number, dy: number): boolean {
    const to = turnedView(this.view, dx, dy);
    if (!to) return false;
    this.view = to;
    this.draw();
    return true;
  }

  /** The bar's Fit, Zoom in and Zoom out (`ratio` 0 fits): one glide, at the angle the camera looks from now. */
  zoomBy(ratio: number): void {
    const to = ratio ? pinchView(this.view, this.stops, ratio, middleOf(this.view)) : this.fitted();
    if (!ratio) this.rooms.shut(); // Fit shows the whole drawing: no room is open
    this.glideTo(to);
    this.untouched = !ratio;
  }

  /** Glides to `to`, or goes there at once when the reader asks for less motion (rule 7). */
  glideTo(to: View): void {
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
    const { w, h } = (this.view = aroundAgain(this.view, this.spots.values())); // a pan round the globe comes back
    const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    const detail = { ...detailAt(this.sizes, this.view.scale), faintRoads: this.faint.drawn() };
    const focus = this.focus.of(this.hands?.selected() ?? this.rooms.picked);
    const all = marksOf(this.scene, this.spots, detail, this.look(), this.view, this.hands?.own, focus);
    this.marks = this.cards ? this.cards.under(all, this.view) : all; // the cards stand for their items' dots and names
    const level = this.level();
    this.canvas.setAttribute('aria-label', level);
    if (level !== this.said) this.hands?.drawn?.();
    // the level badge comes with the first drawing, so the cover cards are watched again (render_chrome_slots)
    if (level !== this.said) for (const card of coverCards(this.viewport)) this.watcher?.observe(card);
    this.said = level;
    this.mini?.draw();
    const c = this.canvas.getContext?.('2d') as (CanvasRenderingContext2D & Canvas2d) | null | undefined;
    if (c) c.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (c) paintCanvas(c, this.marks, w, h);
    this.cards?.draw(this.view, this.look(), c ?? null, (k) => this.colourOf(k), this.hands?.selected());
  }

  /** Cards on or off (render_cards): the drawing spreads to make room for them, or draws back, gliding either way. */
  showCards(on: boolean, atOnce = false): void {
    if (on === !!this.cards) return;
    this.stopCards(); // a press mid-glide starts from where that glide was going
    const untouched = this.untouched,
      done = () => (untouched ? (this.view = this.fitted()) : (this.fitted(), (this.untouched = false)), this.draw());
    const { viewport, scene, spots, sizes, drawing, g, view } = this,
      host = { viewport, scene, spots, sizes, drawing, g, view, words: this.cardWords };
    const next = switchCards(host, this.cards, on, () => this.draw(), done, atOnce);
    [this.cards, this.view, this.stopCards] = [next.cards, next.view, next.stop];
  }

  /** The look of the theme shown now, in the window the card is in. */
  private look(): typeof LIGHT {
    return this.canvas.ownerDocument.body.classList.contains('theme-dark') ? DARK : LIGHT;
  }

  /** The colour the drawing gives `key` now, so the colour key shows the same one (Roger, 7 Nov 2026). */
  colourOf(key: string): string | undefined {
    return coloursOf(this.scene, this.look(), this.hands?.own).get(key);
  }

  /** Takes the canvas away and shows today's drawing again. */
  unload(): void {
    this.gliding++; // a glide still running stops with the stage
    this.mover?.unload();
    this.stopCards();
    this.cards?.remove();
    this.focus.cancel();
    this.faint.remove();
    this.viewport.removeEventListener('wheel', this.onWheel, { capture: true });
    this.viewport.removeEventListener('keydown', this.onKey);
    this.watcher?.disconnect();
    this.canvas.remove();
    this.mini?.remove();
    this.viewport.removeClass('thoughtknot-new-rendering');
  }
}
