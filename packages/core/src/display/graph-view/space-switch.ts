// One button on the card's bar shows the drawing flat (2D), as cards in space (2.5D) or as balls in space (3D). It is
// editor spec §53, space_one_bar. Roger, 24 Oct 2026: "The move between 2d/2.5d and 3d should just be another
// toolbar button. All of the toolbar/options in the 2d view now should also be in the other views".
//
// So the view in space opens inside the drawing's frame, under the card's bar (space-view-panel.ts). The bar's types,
// View menu, Find, filter, full screen and details all work on it as on the flat drawing. Fit and zoom move its camera.
// It stays open as the View menu lays the drawing out again, and as the type changes (type-place.ts).
import { word } from '@thoughtknot/core';
import { ZOOM_STEP } from '../../space-controls.ts';
import { asDrawnFor } from '../../space-spread.ts';
import type { SpaceMove } from '../../space-controls.ts';
import { openSpaceView } from './space-view-panel';
import { fadeOut } from './space-view-pad.ts';
import type { SpaceView } from './space-view-panel';
import type { ViewOptions } from './view-options';

/** What the card's options say of the view in space: its type, its spacing, and whether its mini-map shows. */
export type SpaceSays = Pick<ViewOptions, 'diagram' | 'switches' | 'aids'>;

/** How the drawing is shown in space: as cards (2.5D) or as balls (3D). Flat is null. */
export type SpaceMode = 'cards' | 'balls';

/** Each way in the order the button goes through them, and what it says for each. */
const MODES: (SpaceMode | null)[] = [null, 'cards', 'balls'];
const WORDS = ['bar.space-flat', 'bar.space-cards', 'bar.space-balls'] as const;

/** A card's switch between 2D, 2.5D and 3D. */
export class SpaceSwitch {
  private view: SpaceView | null = null;
  private now: SpaceMode | null = null;
  private button: HTMLButtonElement | null = null;
  /** Counts each change, so a view that opens after a later change is closed at once. */
  private turn = 0;

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
  ) {}

  /** How the drawing is shown now: in space as cards or balls, or flat (null). */
  mode(): SpaceMode | null {
    return this.now;
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
    if (!mode) {
      // it fades out over the flat drawing (space_glide)
      const view = this.view,
        el = this.svg()?.parentElement?.querySelector<HTMLElement>(':scope > .thoughtknot-space-view');
      this.view = null;
      if (view) el ? fadeOut(el, () => view.close()) : view.close();
      return;
    }
    if (this.view) return this.view.cards(mode === 'cards');
    const svg = this.svg(),
      frame = svg?.parentElement;
    if (!svg || !frame) return this.closed(turn);
    const view = await openSpaceView(frame, svg, this.graph, () => this.closed(turn), {
      cards: mode === 'cards',
      asDrawn: asDrawnFor(this.says().diagram?.choice),
      layout: () => this.says().switches?.state.layout,
      miniMap: () => this.says().aids?.miniMap ?? 'off',
    });
    if (turn !== this.turn) return view?.close();
    this.view = view;
    if (!view) this.closed(turn);
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

  /** The view opened at change `turn` closed, by Escape or as the card went: the drawing is flat again. */
  private closed(turn: number): void {
    if (turn !== this.turn) return;
    this.view = null;
    this.now = null;
    this.label();
    if (this.button?.isConnected) this.svg()?.parentElement?.focus();
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
