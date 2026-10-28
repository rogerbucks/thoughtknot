// The viewer's aids as the settings say (editor spec §24), and the card's use of them:
// - when the mini-map shows (mini_map_setting);
// - whether the details panel stays open (details_always_visible) and where it goes (details_narrow);
// - how tall a drawing in a note may be (drawing_height_setting);
// - the quick-info tooltip;
// - the view preset, by its id: the graph's own, written in its style graph, else the settings' (§69);
// - the space a card opens in, its painter and its lens, as its style graph's Render sets them (§68,
//   layout_concept_layers, projections_all_on).
// A card is given the settings with its other options, the same in a note, the pane and full screen. `Aids` holds the
// parts a card builds from them.
import type { Lifecycle } from '../lifecycle';
import { presetFor, renderFor, tallestOf } from '@thoughtknot/core';
import type { Drawn, Lens, MiniMapSetting, Painter, Settings, Space, StyleGraph, View, Zoom } from '@thoughtknot/core';
import type { DetailsPanel } from './details-panel';
import { LensSvg, renderLensChoice } from './lens-svg';
import { MiniMap } from './mini-map';
import { QuickInfo } from './quick-info';
import { SemanticZoom } from './semantic-zoom-view.ts';
import type { SemanticRung } from '../../semantic-zoom.ts';
import type { Taps } from './taps';
import type { ViewOptions } from './view-options';

/** What a drawing's aids are set to. */
export interface ViewerAids {
  miniMap: MiniMapSetting;
  /** Whether the details panel stays open, showing the graph's summary while nothing is chosen. */
  detailsOpen: boolean;
  /** The share of the window a drawing in a note may take (§24, drawing_height_setting); null for no limit. */
  tallest?: number | null;
  /** The view preset that applies (§69), by its id: how the card reads, selects and moves. */
  preset?: string;
  /** The space the card opens in, and what paints it in space or as an overview (render-choice.ts). */
  space?: Space;
  painter?: Painter;
  /** The lens the card's drawing is seen through until the View menu picks another (lenses.ts). */
  lens?: Lens;
}

/**
 * The aids the settings give, with the preset the graph's style graph chooses winning over theirs (view_presets_scoped).
 * The style graph's Render for `view`, or the whole graph, gives the space, painter and lens.
 */
export const aidsOf = (s: Settings, style?: Pick<StyleGraph, 'presets' | 'renders'>, view?: string): ViewerAids => ({
  miniMap: s.miniMap,
  detailsOpen: s.detailsOpen === 'on',
  tallest: tallestOf(s.drawingHeight),
  preset: presetFor({ graph: style?.presets[0]?.preset, everywhere: s.viewPreset }).id,
  ...(style ? renderFor(style, view) : {}),
});

/** How wide a card must be, in pixels, for the details to sit beside the drawing; narrower, they go below it (§24). */
const BESIDE_MIN = 560;

/** What the aids ask of their card, most of it given late because the card builds it after them. */
export interface AidsHost {
  o: ViewOptions;
  /** The card's own element. */
  root: HTMLElement;
  viewport: HTMLElement;
  svg: () => SVGSVGElement | null;
  zoom: () => Zoom;
  /** The viewport's size as the zoom has it: none while the card is hidden. */
  size: () => { width: number; height: number };
  drawn: () => Drawn;
  taps: Taps;
  byKeyboard: () => boolean;
  /** What a lens follows, the selected thing by its key, and the View menu it is picked in, if the card has one. */
  lens: { selected: () => string | null; menu: () => LensMenu | null };
}

/** The View menu a lens is picked in, and its ladder, which semantic zoom steps. */
interface LensMenu {
  menu: { el: HTMLElement };
  step: (r: SemanticRung) => void;
}

/** The aids of one card: its mini-map, its tooltip, and where its kept-open details sit. */
export class Aids {
  readonly info: QuickInfo;
  private readonly miniMap: MiniMap | null;
  /** The lens the drawing is seen through (§68, projections_all_on); none for a table. */
  private readonly lens: LensSvg | null;
  /** Semantic zoom, stepping the ladder of detail as the person zooms (projection_semantic_zoom). */
  private readonly semantic: SemanticZoom | null;
  private readonly host: AidsHost;

  /** For the card (which owns their listeners) and what they ask of it. */
  constructor(card: Lifecycle, host: AidsHost) {
    this.host = host;
    this.info = new QuickInfo({
      o: host.o,
      svg: host.svg,
      viewport: () => host.viewport,
      view: () => host.zoom().view(),
      taps: host.taps,
      byKeyboard: host.byKeyboard,
    });
    // a small copy of the whole drawing, shown by its setting; a graph drawn as a table has none (§24, mini_map)
    this.miniMap = host.svg()
      ? new MiniMap(host.viewport, card, {
          setting: () => host.o.aids?.miniMap ?? 'off',
          zoom: host.zoom,
          size: host.size,
        })
      : null;
    this.miniMap?.redrawn(host.drawn());
    const { o, viewport, zoom, taps } = host,
      state = o.switches?.state;
    this.lens = host.svg()
      ? new LensSvg(card, { svg: host.svg, viewport, zoom, taps, written: o.aids?.lens, state, ...host.lens })
      : null;
    const menu = host.lens.menu(),
      written = o.aids?.lens;
    const step = (r: SemanticRung) => host.lens.menu()?.step(r);
    this.semantic =
      state && menu
        ? new SemanticZoom({ win: viewport.win, state, written, view: () => zoom().view(), size: host.size, step })
        : null;
    if (this.lens && menu) renderLensChoice(menu.menu.el, this.lens, host.svg, () => this.semantic?.picked());
  }

  /** Laid out again: the mini-map is a copy of the layout as it is now, the lens bends it anew, semantic zoom waits. */
  redrawn(drawn: Drawn): void {
    this.miniMap?.redrawn(drawn);
    this.lens?.redrawn();
    this.semantic?.redrawn();
  }

  /** The view changed: the mini-map outlines the part in view, a tooltip closes, the lens follows, semantic zoom steps. */
  viewChanged(v: View): void {
    this.miniMap?.update(v);
    this.info.hide();
    this.lens?.changed();
    this.semantic?.changed();
  }

  /** Kept open, the details are in the card from the start, with the graph's summary until a thing is chosen (§24). */
  openDetails(details: DetailsPanel): void {
    if (!this.host.o.aids?.detailsOpen) return;
    this.host.root.addClass('is-details-open');
    this.placeDetails();
    details.summary();
  }

  /** Beside the drawing, or below it once the card is narrower than the two side by side need (§24, details_narrow). */
  placeDetails(): void {
    const width = this.host.root.clientWidth;
    // a card with no width yet, not on the page, is left as it was
    if (this.host.o.aids?.detailsOpen && width) this.host.root.toggleClass('is-details-below', width < BESIDE_MIN);
  }

  /** The card is going: its tooltip goes with it. */
  unload(): void {
    this.info.onunload();
  }
}
