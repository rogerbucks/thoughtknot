// One button on the card's bar shows the drawing flat (2D), as cards in space (2.5D) or as balls in space (3D). It also
// shows it on a globe (§71, globe_view; Roger, 31 Oct 2026). It is editor spec §53, space_one_bar. Roger, 24 Oct 2026: "The move between 2d/2.5d and 3d should just be another
// toolbar button. All of the toolbar/options in the 2d view now should also be in the other views".
//
// So the view in space opens inside the drawing's frame, under the card's bar (space-view-panel.ts). The bar's types,
// View menu, Find, filter, full screen and details all work on it as on the flat drawing. Fit and zoom move its camera.
// It stays open as the View menu lays the drawing out again, and as the type changes (type-place.ts).
import { propertiesOf, spaceMode, word } from '@thoughtknot/core';
import { ZOOM_STEP } from '../../space-controls.ts';
import { asDrawnFor } from '../../space-spread.ts';
import type { SpaceMove } from '../../space-controls.ts';
import type { Sketch } from '../../sketch.ts';
import type { Orbit } from '../../space-view.ts';
import { openSpaceView } from './space-view-panel';
import type { SpaceMode, SpaceView } from './space-view-options.ts';
import { fadeOut } from './space-view-pad.ts';
import { flatAgain } from './lens-svg';
import type { Lens } from '../../lenses.ts';
import { lensIn, viewOf } from '../../view-support.ts';
import type { ViewOptions } from './view-options';

/** What the card's options say of the view in space: its type, its spacing, and whether its mini-map shows. */
export type SpaceSays = Partial<Pick<ViewOptions, 'diagram' | 'switches' | 'aids' | 'reading' | 'graph'>>;

export type { SpaceMode };

/** Each way in the order the button goes through them, and what it says for each. */
const MODES: (SpaceMode | null)[] = [null, 'cards', 'balls', 'globe'];

/** How many of a thing's properties the globe shows beside it. */
const GLOBE_PROPERTIES = 3;

const WORDS = ['bar.space-flat', 'bar.space-cards', 'bar.space-balls', 'bar.space-globe'] as const;

/** A card's switch between 2D, 2.5D and 3D. */
export class SpaceSwitch {
  private view: SpaceView | null = null;
  private now: SpaceMode | null = null;
  private button: HTMLButtonElement | null = null;
  /** Counts each press, so only the last one is shown once a view still opening is open. */
  private turn = 0;
  /** The view open or opening now, so the close of one already gone is not taken for this one's (space_press_kept). */
  private live: object | null = null;
  /** The view opening now, if one is: a press meanwhile waits for it, so two views never open at once. */
  private opening: Promise<void> | null = null;
  /** Where the camera starts as the view next opens, if the last card left it somewhere. */
  private start: Orbit | undefined;

  /** How far the camera sat as the view in space first painted: nearer than that is zoomed in. */
  private far = 0;
  /** Told each time the camera in space moves: the card's semantic zoom listens. */
  private onCamera: () => void = () => {};

  /** The graph's name, which the view in space is named by. */
  private graph = '';

  /**
   * For a card's drawing, its SVG, none for a table: the view in space lies over the frame it is in. And what the card's
   * options say. Its things stay where the type drew them, so a type chosen changes the view in space too. A network is
   * laid out afresh in space (space_follows_type). Its mini-map shows as the flat drawing's does (space_mini_map).
   */
  constructor(
    private readonly svg: () => SVGSVGElement | null,
    private readonly says: () => SpaceSays = () => ({}),
    private readonly sketch: () => Sketch | null = () => null,
    private readonly centre: () => string | null = () => null,
  ) {}

  /** Where the camera starts as the view next opens: as the last card left it, drawn again in its place (NEURO-7). */
  startAt(orbit: Orbit | undefined): void {
    this.start = orbit;
  }

  /** Where the camera is now, while the drawing is shown in space. */
  orbit(): Orbit | undefined {
    return this.view?.orbit();
  }

  /** Listens to the camera in space: semantic zoom steps as it nears, as zooming flat steps it (projection_semantic_zoom). */
  camera(f: () => void): void {
    this.onCamera = f;
  }

  /** How much nearer the camera is than as the view opened: 1 while flat. */
  nearer(): number {
    const o = this.view?.orbit();
    return o && this.far ? this.far / o.distance : 1;
  }

  /** How the drawing is shown now: in space as cards or balls, or flat (null). */
  mode(): SpaceMode | null {
    return this.now;
  }

  /** How the card opens, as its style graph's Render sets its space (§68, layout_concept_layers): flat, or in space. */
  saved(): SpaceMode | null {
    return spaceMode(this.says().aids?.space);
  }

  /** The bar's button, which says how the drawing is shown now, none for a table; and the graph's name. */
  bar(b: HTMLButtonElement | null, graph: string): void {
    this.button = b;
    this.graph = graph;
    this.label();
  }

  /** The bar's button was pressed: the drawing is shown the next way. */
  pressed(): void {
    void this.show(MODES[(MODES.indexOf(this.now) + 1) % MODES.length] ?? null);
  }

  /** Shows the drawing as `mode` says; with none, flat. */
  async show(mode: SpaceMode | null): Promise<void> {
    const turn = ++this.turn;
    this.now = mode;
    this.label();
    // a view still opening is let open first; then only the last press is shown (space_press_kept)
    while (this.opening) await this.opening;
    if (turn !== this.turn) return;
    if (!mode) {
      // it fades out over the flat drawing (space_glide)
      const view = this.view,
        el = this.svg()?.parentElement?.querySelector<HTMLElement>(':scope > .thoughtknot-space-view');
      this.view = null;
      this.live = null;
      if (view) el ? fadeOut(el, () => view.close()) : view.close();
      return;
    }
    if (this.view) return this.view.as(mode);
    const live = (this.live = {});
    const svg = this.svg(),
      frame = svg?.parentElement;
    if (!svg || !frame) return this.closed(live);
    flatAgain(svg); // read as drawn: in space it is bent there
    const start = this.start;
    this.start = undefined;
    this.far = 0;
    this.opening = openSpaceView(frame, svg, this.graph, () => this.closed(live), {
      ...(start ? { orbit: start } : {}),
      cards: mode === 'cards',
      globe: mode === 'globe',
      centre: this.centre, // an exploration's centre faces you on the globe (globe_explore_centre)
      details: (key) => this.details(key),
      asDrawn: asDrawnFor(this.says().diagram?.choice),
      layout: () => this.says().switches?.state.layout,
      miniMap: () => this.says().aids?.miniMap ?? 'off',
      painter: this.says().aids?.painter,
      lens: () => this.lens(), // as the View menu picks it (§68), where the view can take it
      sketch: this.sketch,
      moved: (o) => {
        this.far ||= o.distance;
        this.onCamera();
      },
    }).then((view) => {
      this.view = view;
      if (!view) this.closed(live);
    });
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }

  /** Makes the bar's move `m` in space, if the drawing is shown there; says whether it was. */
  move(m: SpaceMove): boolean {
    this.view?.move(m);
    return !!this.view;
  }

  /** The bar's Fit and zoom: they move the camera while the drawing is shown in space, else they zoom it flat. */
  zooming(zoom: () => { fit: () => void; zoomIn: () => void; zoomOut: () => void }) {
    return {
      fit: () => this.move({ reset: true }) || zoom().fit(),
      zoomIn: () => this.move({ zoom: ZOOM_STEP }) || zoom().zoomIn(),
      zoomOut: () => this.move({ zoom: 1 / ZOOM_STEP }) || zoom().zoomOut(),
    };
  }

  /** The lens the View menu picks, else the Render's; none where the view drawn cannot take it (view-support.ts). */
  private lens(): Lens | undefined {
    const { switches, aids, diagram } = this.says(),
      l = switches?.state.lens ?? aids?.lens;
    return l && lensIn(viewOf(diagram?.choice.drawn, diagram?.picture?.type), l);
  }

  /**
   * The view `live` closed, by Escape or as the card went: the drawing is flat again, and the button says so. It is
   * so whichever way the view was shown as it closed (space_press_kept). The close of a view already gone does nothing.
   */
  private closed(live: object): void {
    if (live !== this.live) return;
    this.live = null;
    this.view = null;
    this.now = null;
    this.label();
    if (this.button?.isConnected) this.svg()?.parentElement?.focus();
  }

  /** The first few properties of the thing `key`, as the card reads them: shown beside it on the globe as you near. */
  private details(key: string): string[] {
    const { reading, graph } = this.says();
    if (!reading || graph === undefined) return [];
    return propertiesOf(reading, graph, { thing: key })
      .slice(0, GLOBE_PROPERTIES)
      .map((p) => `${p.key}: ${p.value}`);
  }

  /** The button says how the drawing is shown now, and is pressed while it is in space. */
  private label(): void {
    const b = this.button;
    if (!b) return;
    const now = word(WORDS[MODES.indexOf(this.now)] ?? 'bar.space-flat');
    b.setAttribute('aria-label', `${word('bar.space')}: ${now}`);
    b.setAttribute('aria-pressed', String(this.now !== null));
    b.querySelector<HTMLElement>('.thoughtknot-badge-text')?.setText(now);
  }
}
