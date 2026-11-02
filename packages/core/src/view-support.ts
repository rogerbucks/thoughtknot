// Which View menu options each view type supports (editor spec §68, view_options_everywhere). Roger, 2 Nov 2026: "The
// lack of consistent functionality is driving me nuts." Every option is offered in every view. Where one cannot work,
// the menu still shows it, greyed, and says why in a line. It never just vanishes. This table is the one place that
// says so. The menu, the dock and the tests all read it. Host-free and pure.
import { VIEW_TYPES } from './view-types/view-types.ts';
import type { Lens } from './lenses.ts';
import type { WordKey } from './words.ts';

/** The options the View menu and the dock offer, alike in every view. */
export const VIEW_OPTIONS = [
  'detail',
  'labels',
  'hubs',
  'groups',
  'merge',
  'groupBy',
  'lanes',
  'layout',
  'spacing',
  'direction',
  'lens',
  'semantic',
] as const;
/** One of the View menu's options. */
export type ViewOption = (typeof VIEW_OPTIONS)[number];

/**
 * Why an option is not offered in a view. `cells`: the view lines things up in rows and cells, so a lens would break
 * reading across. `no-links`: it draws no links. `own-shape`: its shape is its layout. `fixed-way`: its shape sets
 * which way it runs. `yet`: it could apply, and is still to be built (listed as a gap in view-support.test.js).
 */
export const NOT_HERE = ['cells', 'no-links', 'own-shape', 'fixed-way', 'yet'] as const;
/** Why an option is not offered in a view. */
export type NotHere = (typeof NOT_HERE)[number];
/** Whether an option works in a view: yes, or why not. */
export type Support = 'yes' | NotHere;

/** The diagram types laid out as a graph, with the View menu (§15). A table has none of its options. */
export const GRAPH_TYPES = ['network', 'tree', 'flow', 'radial', 'lanes', 'timeline'] as const;
/** Every view the support table covers: the graph's diagram types, then the views drawn as marks. */
export const SUPPORTED_VIEWS: readonly string[] = [...GRAPH_TYPES, ...VIEW_TYPES];

/** The views drawn as marks that line things up in tiles, with no links drawn between them. */
const TILES = new Set(['matrix', 'treemap', 'density', 'grid', 'plan', 'map']);
/** The views whose rows and cells a lens would bend out of line. */
const CELLS = new Set(['matrix', 'density']);
/** The diagram types whose shape sets which way they run. */
const FIXED_WAY = new Set(['radial', 'timeline']);
/** The options a view drawn as marks takes from the graph's layout, which its own shape replaces. */
const LAYOUT_ONLY: readonly ViewOption[] = ['lanes', 'layout', 'spacing', 'direction'];
/** The options only our own engine reads, so only a plain network takes them yet (view_controls_apply). */
const OWN_ENGINE: readonly ViewOption[] = ['lanes', 'layout', 'direction'];
/** The options that fold or group the graph before a view drawn as marks draws it: still to be built there. */
const FOLDS: readonly ViewOption[] = ['detail', 'hubs', 'groups', 'merge', 'groupBy', 'semantic'];

/** Whether `option` works in `view`: a diagram type such as `tree`, or a view drawn as marks such as `matrix`. */
export function viewSupport(view: string, option: ViewOption): Support {
  if (!SUPPORTED_VIEWS.includes(view)) return 'own-shape';
  if ((GRAPH_TYPES as readonly string[]).includes(view)) {
    if (option === 'direction' && FIXED_WAY.has(view)) return 'fixed-way';
    // our own engine lays out a plain network only: Graphviz lays the other types out, without these (PR 4)
    if (OWN_ENGINE.includes(option) && view !== 'network') return 'yet';
    return 'yes';
  }
  if (option === 'lens') return CELLS.has(view) ? 'cells' : 'yes';
  // Force lays things out itself, so it takes the View menu's spacing; its own layout is still to be built (PR 4)
  if (view === 'force' && (option === 'spacing' || option === 'layout')) return option === 'spacing' ? 'yes' : 'yet';
  if (LAYOUT_ONLY.includes(option)) return 'own-shape';
  if (TILES.has(view) && (option === 'labels' || option === 'hubs' || option === 'merge')) return 'no-links';
  if (FOLDS.includes(option)) return 'yet';
  return 'yes';
}

/** The view a card draws: the view type its picture is, by its last name, else its diagram type, else a network. */
export function viewOf(drawn: string | undefined, picture?: string): string {
  const name = picture?.slice(picture.lastIndexOf('.') + 1);
  return name && (VIEW_TYPES as readonly string[]).includes(name) ? name : (drawn ?? 'network');
}

/** The words that say why an option is not offered here. */
export const notHereSaid = (why: NotHere): WordKey => `view.not-here.${why}`;

/** `lens` as `view` takes it: itself, or none where the view cannot take a lens, or semantic zoom. */
export function lensIn(view: string, lens: Lens): Lens {
  if (lens === 'none') return lens;
  return viewSupport(view, lens === 'semantic' ? 'semantic' : 'lens') === 'yes' ? lens : 'none';
}
