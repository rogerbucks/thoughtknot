// The flat drawing's key controls (editor spec §25, controls_keys). Roger, 1 Nov 2026: the controls used most stay on
// screen, not in a menu. The plan of that day moves the View menu's settings used every week onto the screen. Those are
// its ladder of detail and its switch for small labels. So a 2D card lists them as its key controls, for the dock every
// view shares: less detail, more detail, and small labels hidden. The menu and the dock always agree.
import { switchName, word } from '@thoughtknot/core';
import type { ViewState, ViewSwitch } from '@thoughtknot/core';
import { SEMANTIC_RUNGS, type SemanticRung } from '../../semantic-zoom.ts';
import { renderDock } from './controls-dock.ts';
import { fillDock } from './controls-keys.ts';
import { OPTION_ATTRIBUTE } from '../../view-menu-rows.ts';

/** The View menu, as the dock needs it: it redraws its switches, and the dock follows. */
export interface ViewMenu {
  refresh: () => void;
}

/** What the dock asks of the card's switches: to step the ladder, or turn a switch. */
export interface ViewKeys {
  step: (r: SemanticRung) => void;
  turn: (s: ViewSwitch, on: boolean) => void;
}

/** Builds the 2D view's dock in the card `root`, from its `state`, kept in step with its `menu`. */
export function viewDock(root: HTMLElement, state: ViewState, menu: ViewMenu, act: ViewKeys): void {
  const rungAt = (by: number): SemanticRung | undefined => SEMANTIC_RUNGS[SEMANTIC_RUNGS.indexOf(state.rung) + by];
  const step = (by: number) => {
    const to = rungAt(by);
    if (to) act.step(to);
  };
  const dock = renderDock(root, word('controls.view'), ['thoughtknot-view-dock']);
  const [less, more, labels] = fillDock(dock, [
    { name: word('controls.less'), icon: 'fold-vertical', run: () => step(-1) },
    { name: word('controls.more'), icon: 'unfold-vertical', run: () => step(1) },
    { name: switchName('labels'), icon: 'text', run: () => act.turn('labels', !state.switches.labels) },
  ]);
  // each names the option it is, so a view that cannot take it greys it out (view_options_everywhere)
  for (const [b, o] of [
    [less, 'detail'],
    [more, 'detail'],
    [labels, 'labels'],
  ] as const)
    b?.setAttribute(OPTION_ATTRIBUTE, o);
  // each says the rung it goes to, and is off at the end of the ladder; the labels switch says if it is on
  const show = () => {
    for (const [b, by] of [
      [less, -1],
      [more, 1],
    ] as const) {
      const to = rungAt(by);
      if (to) b?.removeAttribute('disabled');
      else b?.setAttribute('disabled', '');
      b?.setAttribute('aria-label', word(by < 0 ? 'controls.less' : 'controls.more') + (to ? `: ${rungName(to)}` : ''));
    }
    labels?.setAttribute('aria-pressed', String(!!state.switches.labels));
  };
  const was = menu.refresh;
  menu.refresh = () => (was(), show()); // the menu redraws its switches: the dock follows
  show();
}

/** A rung's name: the ladder's own words, or the properties of every thing. */
const rungName = (r: SemanticRung): string =>
  r === 'properties' ? word('controls.properties') : word(`view.detail.${r}`);
