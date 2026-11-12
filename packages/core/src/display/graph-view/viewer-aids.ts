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
import { RenderStage, stageFor, type StageHands } from './render-stage.ts';
import { ZOOM_STEP } from '../../space-controls.ts';
import { turnControls } from './stage-turn-keys.ts';
import type { Lifecycle } from '../lifecycle';
import { presetFor, renderFor, tallestOf } from '@thoughtknot/core';
import type { Drawn, Lens, MiniMapSetting, Painter, Settings, Space, StyleGraph, View, Zoom } from '@thoughtknot/core';
import type { DetailsPanel } from './details-panel';
import { LensSvg, renderLensChoice } from './lens-svg';
import { readableNames } from './readable-names';
import { levelClouds, levelShown, levelsOf } from './level-clouds-svg.ts';
import { LevelHints } from './level-hints.ts';
import { aiLevelHosts, keepKeyHome, keyHome, LevelLegend } from './level-legend.ts';
import { ownHue } from './level-colours.ts';
import { groupEdits } from '../../group-edit.ts';
import { MoveUndo } from './move-undo.ts';
import { moveHint } from './box-move-keys';
import { accept } from './estimate-actions';
import { levelSpace } from './level-space.ts';
import type { SpaceScreen } from './space-view-options.ts';
import { LevelTaps } from './level-taps.ts';
import { word } from '../../words.ts';
import { MiniMap } from './mini-map';
import { QuickInfo } from './quick-info';
import { SemanticZoom } from './semantic-zoom-view.ts';
import { greyNotHere } from './controls-support.ts';
import { lensIn, viewOf } from '../../view-support.ts';
import type { SemanticRung } from '../../semantic-zoom.ts';
import type { Taps } from './taps';
import { keepSlots, slotCards } from './controls-slots.ts';
import type { ViewOptions } from './view-options';

/** How long each step of the levels waits for the next, in milliseconds: one level on at a time (level_one_step). */
const LEVEL_STEP_MS = 180;

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
  /** Whether a graph with levels is drawn by the new rendering, as a preview (render_switch). */
  newRendering?: boolean;
}

/**
 * The aids the settings give, with the preset the graph's style graph chooses winning over the vault's, and that over theirs.
 * The style graph's Render for `view`, or the whole graph, gives the space, painter and lens.
 */
export const aidsOf = (
  s: Settings,
  style?: Pick<StyleGraph, 'presets' | 'renders'>,
  view?: string,
  vaultPreset?: string,
): ViewerAids => ({
  miniMap: s.miniMap,
  detailsOpen: s.detailsOpen === 'on',
  tallest: tallestOf(s.drawingHeight),
  preset: presetFor({ graph: style?.presets[0]?.preset, vault: vaultPreset, everywhere: s.viewPreset }).id,
  newRendering: s.newRendering === 'on',
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
  /** The view in space, if the card has one: its camera zooms semantic zoom as the flat zoom does. */
  space?: { nearer: () => number; camera: (f: () => void) => void; screen?: () => SpaceScreen | null };
  /** What a click on the new rendering chooses or clears, as a tap on today's drawing does. */
  stage?: Omit<StageHands, 'selected'>;
}

/** The bar's Fit and zoom buttons. */
type Zooms = { fit: () => void; zoomIn: () => void; zoomOut: () => void };

/** The View menu a lens is picked in, and its ladder, which semantic zoom steps. */
interface LensMenu {
  menu: { el: HTMLElement; refresh: () => void };
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
  /** Whether names are waiting to be sized at the next frame. */
  private naming = false;
  /** The badge that says which level of detail shows (§68, level_clouds), made the first time one shows. */
  private badge: HTMLElement | null = null;
  /** Watches the corner cards' sizes, so the badge keeps clear of them. */
  private watching: ResizeObserver | null = null;
  /** The badge's words, and its Back button, shown once a cloud was flown into. */
  private said: HTMLElement | null = null;
  private backButton: HTMLElement | null = null;
  /** The taps on the clouds: pick, fly in, and back (level_click_back); none for a table. */
  private readonly levelTaps: LevelTaps | null;
  /** The legend of subjects under the badge: the spotlight, and each subject's colour (level_colours). */
  private legend: LevelLegend | null = null;
  /** What the badge said last. */
  private badgeText: string | null = null;
  /** The badge's one-line hint and arrow legend (level_hints). */
  private hints: LevelHints | null = null;
  /** The new rendering's canvas over the drawing, while its setting is on (render_switch); none for a table. */
  private readonly stage: RenderStage | null;
  /** The stage's turn buttons and keys, shown while it is tilted. */
  private readonly turns: ReturnType<typeof turnControls> | null;

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
    const { viewport: vp, svg, zoom: z, size, taps: t } = host;
    this.levelTaps = svg()
      ? new LevelTaps(card, { viewport: vp, svg, zoom: z, size, taps: t, changed: () => this.level(this.badgeText) })
      : null;
    const { o, viewport, zoom, taps } = host,
      state = o.switches?.state;
    // the view the card draws: a lens or semantic zoom it cannot take is greyed, and never bends it (view-support.ts)
    const view = viewOf(o.diagram?.choice.drawn, o.diagram?.picture?.type),
      allowed = (l: Lens) => lensIn(view, l) === l;
    this.lens = host.svg()
      ? new LensSvg(card, { svg: host.svg, viewport, zoom, taps, written: o.aids?.lens, state, allowed, ...host.lens })
      : null;
    const menu = host.lens.menu(),
      written = o.aids?.lens;
    const step = (r: SemanticRung) => host.lens.menu()?.step(r),
      nearer = () => host.space?.nearer() ?? 1;
    this.semantic =
      state && menu && allowed('semantic')
        ? new SemanticZoom({
            win: viewport.win,
            state,
            written,
            view: () => zoom().view(),
            size: host.size,
            step,
            nearer,
          })
        : null;
    // the camera in space steps semantic zoom, and its levels are drawn again (level_space)
    host.space?.camera(() => {
      this.semantic?.changed();
      this.names();
    });
    if (this.lens && menu) renderLensChoice(menu.menu.el, this.lens, host.svg, () => this.semantic?.picked());
    if (menu) greyNotHere(host.root, menu.menu, view); // greyed with why, never gone (view_options_everywhere)
    // a view in space takes the pointer and the trackpad's pinch while it shows (Roger, 6 Nov)
    const hands = host.stage && {
      ...host.stage,
      selected: () => (this.stage ? host.lens.selected() : null), // nothing is chosen while the card is built
      away: () => !!host.space?.screen?.(),
      drawn: () => this.names(),
      own: (key: string) => {
        const levels = this.legend?.shown();
        return levels ? ownHue(levels, key) : undefined;
      },
    };
    this.stage = host.svg() ? stageFor(viewport, o, hands, o.seen?.before) : null; // glides from the last type shown
    if (this.stage) o.seen?.keep(this.stage.seen);
    this.turns = this.stage && turnControls(host.root, viewport, this.stage);
  }

  /** The bar's Fit and zoom buttons on the new rendering, while it draws the card; none for today's drawing. */
  stageZoom(flat: Zooms): Zooms | null {
    const s = this.stage; // the flat drawing under it zooms too, so the mini-map and labels keep up
    const both = (r: number, k: keyof Zooms) => () => void (s?.zoomBy(r), flat[k]());
    return s && { fit: both(0, 'fit'), zoomIn: both(ZOOM_STEP, 'zoomIn'), zoomOut: both(1 / ZOOM_STEP, 'zoomOut') };
  }

  /** Shows the drawing as the bar's 2D button says on the new rendering, where it can; says whether it did. */
  tilted(mode: string | null): boolean {
    const shown = this.stage?.lookFrom(mode) ?? false;
    this.turns?.shown(shown && !!mode); // tilted: the dock's turn buttons show (controls_keys)
    return shown;
  }

  /** Laid out again: the mini-map is a copy of the layout as it is now, the lens bends it anew, semantic zoom waits. */
  redrawn(drawn: Drawn): void {
    this.miniMap?.redrawn(drawn);
    this.lens?.redrawn();
    this.semantic?.redrawn();
    this.names();
  }

  /** The view changed: the mini-map outlines the part in view, a tooltip closes, the lens follows, semantic zoom steps. */
  viewChanged(v: View): void {
    this.miniMap?.update(v);
    this.info.hide();
    this.lens?.changed();
    this.semantic?.changed();
    this.names();
  }

  /** Names readable at the size the drawing is shown now, sized once a frame however often it changes (§3). */
  private names(): void {
    const svg = this.host.svg();
    if (!svg || this.naming) return;
    this.naming = true;
    const win = this.host.viewport.win ?? window;
    win.requestAnimationFrame(() => {
      this.naming = false;
      // the card closed, or its window went, before the frame came: nothing to name
      if (!svg.isConnected || typeof activeDocument === 'undefined') return;
      const { reading, graph, switches } = this.host.o;
      readableNames(svg, reading.graphs.get(graph)?.links ?? [], !!switches?.state.switches.labels);
      const drawing = reading.graphs.get(graph),
        g = reading.world[graph],
        screen = this.host.space?.screen?.();
      // the new rendering says its own level; the badge and its colour key show over it (Roger, 7 Nov 2026)
      const stage = this.stage && !screen ? this.stage.level() : null;
      this.level(screen ? levelSpace(screen, drawing, g) : (stage ?? levelClouds(svg, drawing, g)));
      const layer = screen ? screen.el.querySelector('svg.thoughtknot-space-levels') : svg;
      this.hints?.show(layer ? levelShown(layer) : null);
      // one level on at a time: still on the way to the one that fits, it draws again in a moment (level_one_step)
      if (layer && levelShown(layer)?.settling) win.setTimeout(() => this.names(), LEVEL_STEP_MS);
      this.levelTaps?.mark();
      const levels = drawing ? levelsOf(drawing, g) : null;
      this.legend?.show(levels);
      // the subjects on the mini-map, by the id each thing's box has in the drawing (level_mini_map)
      if (this.miniMap && svg.isConnected)
        this.miniMap.clouds(levels, () => {
          const ids = new Map<string, string>();
          for (const n of Array.from(svg.querySelectorAll('g.node[data-key]')))
            ids.set(n.getAttribute('data-key') ?? '', n.id);
          return (key) => ids.get(key) ?? null;
        });
    });
  }

  /** Says which level of detail shows, as "Level 2 of 4 · Areas", with Back once a cloud was flown into. */
  private level(text: string | null): void {
    this.badgeText = text;
    const back = !!(this.stage?.rooms.open || this.levelTaps?.canGoBack());
    if (!text && !back && !this.badge) return;
    if (!this.badge) {
      this.badge = this.host.viewport.createDiv({ cls: 'thoughtknot-level-badge' });
      this.backButton = this.badge.createEl('button', {
        cls: 'thoughtknot-level-back',
        text: word('levels.back'),
        attr: { 'aria-label': word('levels.back-label'), type: 'button' },
      });
      this.backButton.addEventListener('click', () => this.stage?.rooms.up() || this.levelTaps?.goBack());
      this.said = this.badge.createSpan();
      // the key of subjects waits in the View panel, shut, where there is one; else under the badge (panels_key)
      this.legend = new LevelLegend(keyHome(this.host.viewport, this.badge), {
        viewport: this.host.viewport,
        svg: this.host.svg,
        redraw: () => {
          this.stage?.draw();
          this.names();
        },
        drawing: () => this.host.o.reading.graphs.get(this.host.o.graph),
        colourOf: (key) => this.stage?.colourOf(key),
        ...aiLevelHosts(() => this.host.o.expand), // name the levels with AI, and keep its names (ai_levels)
        editGroup: () => this.groupEditor(),
      });
      this.hints = new LevelHints(this.badge);
    }
    keepKeyHome(this.host.viewport, this.badge); // a View panel built since takes the key
    this.said?.setText(text ?? '');
    this.backButton?.toggleClass('is-hidden', !back);
    this.badge.toggleClass('is-hidden', !text && !back);
    this.keepClear();
  }

  /** Keeps the badge in its slot, clear of the corner cards, now and whenever they or the drawing change size. */
  private keepClear(): void {
    const viewport = this.host.viewport,
      win = viewport.win ?? window;
    // a badge moved to a new place is not a change of size, so the drawing is fitted again here, clear of it
    const keep = () => {
      const was = this.badge?.getBoundingClientRect();
      keepSlots(viewport);
      const now = this.badge?.getBoundingClientRect();
      if (was && now && (was.left !== now.left || was.top !== now.top)) this.stage?.resized();
    };
    win.requestAnimationFrame(keep);
    const resizeObserver = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (this.watching || typeof resizeObserver !== 'function') return;
    const watching = new resizeObserver(keep);
    for (const el of [viewport, ...slotCards(viewport)]) watching.observe(el);
    this.watching = watching;
  }

  /**
   * How a named group's things are written (cloud_edit): into the text being edited, else the note. Each edit offers its
   * undo, and says why when nothing was written. None while the card is only read.
   */
  private groupEditor():
    ((things: readonly string[], property: string, value: string | null, said: string) => void) | null {
    const o = this.host.o;
    if (o.readOnly?.() || (!o.writeBlock && !o.editing?.()?.session)) return null;
    return (things, property, value, said) => {
      const say = (why: string) => {
        const line = moveHint(this.host.viewport);
        line.hidden = false;
        line.textContent = why;
      };
      const edits = groupEdits(o.reading.texts, o.graph, things, property, value);
      if ('reason' in edits) return say(edits.reason);
      const undo = new MoveUndo(this.host.viewport, o.graph);
      void (async () => {
        for (const e of edits) {
          const why = await accept(o, e.block, e.was, e.now);
          if (why) return say(why);
        }
        undo.offer(said, async () => {
          for (const e of [...edits].reverse()) await accept(o, e.block, e.now, e.was);
        });
      })();
    };
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
    this.stage?.unload();
    this.turns?.unload();
    this.watching?.disconnect();
    this.info.onunload();
  }
}
