// The View menu's layout controls (editor spec §53, layout_saved_with_view; §68, layout_plugins): its sliders and lists,
// and which of them only our own engine reads (view_controls_apply). Host-free: view-switches.ts draws them.
import { LAYOUT_OPTION_RANGE, word } from '@thoughtknot/core';
import type { LayoutOptions, WordKey } from '@thoughtknot/core';
import { LAYOUT_CHOICES, type LayoutChoice } from '../../layouts/layout-options.ts';
import { offeredLayouts, strategyName } from '../../layouts/offered.ts';

/** The View menu's layout sliders, and how far one step moves each, in every view (§53, layout_saved_with_view). */
const LAYOUT_SLIDERS = [
  ['spacing', 'view.layout.spacing', 0.25],
  ['linkLength', 'view.layout.link-length', 0.25],
  ['groupPull', 'view.layout.group-pull', 0.1],
  ['rounds', 'view.layout.rounds', 0.25],
] as const satisfies readonly (readonly [keyof LayoutOptions, string, number])[];
/**
 * The menu's controls that only our own engine reads (view_controls_apply). Roger, 2 Nov 2026: "Does the View menu
 * update the screen?" A diagram type Graphviz lays out reads none of them, so there each is greyed, saying why.
 */
export const OWN_ONLY: ReadonlySet<string> = new Set(['lanes', 'rounds', 'strategy', 'direction', 'shape', 'pinned']);
/** The View menu's layout choices: the layout first, then its variables, alike in 2D and 3D (layout_plugins). */
const LAYOUT_LISTS = ['strategy', 'direction', 'shape', 'pinned'] as const satisfies readonly LayoutChoice[];

/** The words choice `k` may be, each with what the menu says for it. */
const listed = (k: LayoutChoice): [string, string][] =>
  k === 'strategy'
    ? [...LAYOUT_CHOICES.strategy, ...offeredLayouts().map((l) => l.id)].map((v) => [v, strategyName(v)])
    : LAYOUT_CHOICES[k].map((v) => [v, word(`view.layout.${k}.${v.toLowerCase()}` as WordKey)]);

/**
 * The menu's layout sliders and lists, each in the place `holder` gives, which `spaced` acts on as one is set. None
 * without `spaced`.
 */
export function layoutControls(
  holder: () => HTMLElement,
  spaced?: <K extends keyof LayoutOptions>(k: K, v: LayoutOptions[K]) => void,
) {
  const sliders = (spaced ? LAYOUT_SLIDERS : []).map(([k, says, step]) => {
    const [least, most] = LAYOUT_OPTION_RANGE[k];
    const row = holder().createEl('label', { cls: 'thoughtknot-layout-option', text: word(says) });
    const input = row.createEl('input', {
      attr: { type: 'range', min: String(least), max: String(most), step: String(step) },
    });
    input.addEventListener('change', () => spaced?.(k, Number(input.value)));
    return { k, input };
  });
  const lists = (spaced ? LAYOUT_LISTS : []).map((k) => {
    const row = holder().createEl('label', { cls: 'thoughtknot-layout-choice', text: word(`view.layout.${k}`) });
    const input = row.createEl('select');
    for (const [value, text] of listed(k)) input.createEl('option', { text, attr: { value } });
    input.addEventListener('change', () => spaced?.(k, input.value));
    return { k, input };
  });
  return { sliders, lists };
}
