// The rows of a card's View menu, as data (editor spec §25, view_switches; §68, view_options_everywhere): the line
// under each switch, the layout sliders and lists, and the option each row is. The menu itself is drawn by
// display/graph-view/view-switches.ts. Each row names its option (view-support.ts) by `data-option`, so a view that
// cannot take it greys that row out and says why. Host-free and pure.
import type { ViewSwitch } from './view-switches.ts';
import { LAYOUT_CHOICES, type LayoutChoice, type LayoutOptions } from './layouts/layout-options.ts';
import { offeredLayouts, strategyName } from './layouts/offered.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** The line under each switch saying in plain words what it does (F9 of the UX review, 25 Oct 2026). */
export const HINTS = {
  labels: 'view.hint.labels',
  hubs: 'view.hint.hubs',
  groups: 'view.hint.groups',
  merge: 'view.hint.merge',
  lanes: 'view.hint.lanes',
} as const satisfies Record<Exclude<ViewSwitch, 'engine'>, WordKey>;

/** The View menu's layout sliders, and how far one step moves each, in every view (§53, layout_saved_with_view). */
export const LAYOUT_SLIDERS = [
  ['spacing', 'view.layout.spacing', 0.25],
  ['linkLength', 'view.layout.link-length', 0.25],
  ['groupPull', 'view.layout.group-pull', 0.1],
  ['rounds', 'view.layout.rounds', 0.25],
] as const satisfies readonly (readonly [keyof LayoutOptions, string, number])[];
/** The View menu's layout choices: the layout first, then its variables, alike in 2D and 3D (layout_plugins). */
export const LAYOUT_LISTS = ['strategy', 'direction', 'shape', 'pinned'] as const satisfies readonly LayoutChoice[];

/** The words choice `k` may be, each with what the menu says for it. */
export const listed = (k: LayoutChoice): [string, string][] =>
  k === 'strategy'
    ? [...LAYOUT_CHOICES.strategy, ...offeredLayouts().map((l) => l.id)].map((v) => [v, strategyName(v)])
    : LAYOUT_CHOICES[k].map((v) => [v, word(`view.layout.${k}.${v.toLowerCase()}` as WordKey)]);

/** The attribute that names the option a row of the menu is (view-support.ts). */
export const OPTION_ATTRIBUTE = 'data-option';
/** The ladder of detail's attributes, described by the hint `hint`. */
export const ladderAttributes = (hint: string): Record<string, string> => ({
  role: 'radiogroup',
  'aria-label': word('view.detail'),
  'aria-describedby': hint,
  [OPTION_ATTRIBUTE]: 'detail',
});
/** The Group by row's option. */
export const GROUP_BY_ROW = { [OPTION_ATTRIBUTE]: 'groupBy' };
/** A layout slider's option: rounds are the layout's; the others space what any layout draws. */
export const layoutSliderRow = (k: keyof LayoutOptions): Record<string, string> => ({
  [OPTION_ATTRIBUTE]: k === 'rounds' ? 'layout' : 'spacing',
});
/** A layout list's option: which way it runs is its own; the rest are the layout's. */
export const layoutListRow = (k: LayoutChoice): Record<string, string> => ({
  [OPTION_ATTRIBUTE]: k === 'direction' ? k : 'layout',
});
