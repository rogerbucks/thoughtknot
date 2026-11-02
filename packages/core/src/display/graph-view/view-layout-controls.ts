// The View menu's layout controls (editor spec §53, layout_saved_with_view; §68, layout_plugins): its sliders and lists,
// and which of them only our own engine reads (view_controls_apply). Host-free: view-switches.ts draws them.
import { LAYOUT_OPTION_RANGE, word } from '@thoughtknot/core';
import type { LayoutOptions } from '@thoughtknot/core';
import { LAYOUT_LISTS, LAYOUT_SLIDERS, layoutListRow, layoutSliderRow, listed } from '../../view-menu-rows.ts';

/**
 * The menu's controls that only our own engine reads (view_controls_apply). Roger, 2 Nov 2026: "Does the View menu
 * update the screen?" A diagram type Graphviz lays out reads none of them, so there each is greyed, saying why.
 */
export const OWN_ONLY: ReadonlySet<string> = new Set(['lanes', 'rounds', 'strategy', 'shape', 'pinned']);

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
    const row = holder().createEl('label', {
      cls: 'thoughtknot-layout-option',
      text: word(says),
      attr: layoutSliderRow(k),
    });
    const input = row.createEl('input', {
      attr: { type: 'range', min: String(least), max: String(most), step: String(step) },
    });
    input.addEventListener('change', () => spaced?.(k, Number(input.value)));
    return { k, input };
  });
  const lists = (spaced ? LAYOUT_LISTS : []).map((k) => {
    const row = holder().createEl('label', {
      cls: 'thoughtknot-layout-choice',
      text: word(`view.layout.${k}`),
      attr: layoutListRow(k),
    });
    const input = row.createEl('select');
    for (const [value, text] of listed(k)) input.createEl('option', { text, attr: { value } });
    input.addEventListener('change', () => spaced?.(k, input.value));
    return { k, input };
  });
  return { sliders, lists };
}
