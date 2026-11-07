// A view's key controls, as data (editor spec §25, controls_keys). Roger, 1 Nov 2026: a view's key controls stay on
// screen without menu diving, with an expander for the rest. Each view lists its key controls, most used first. One
// shared dock draws them: the first five as tiles in its body, each with its icon and name, the rest under More. So
// every view has the same controls in the same place. On a tablet-sized window the dock folds to a rail of their icons
// (styles.css).
import { button } from '../button.ts';
import type { ControlDock } from './controls-dock.ts';

/** One key control of a view: what it is called, its icon and what it does. */
export interface KeyControl {
  name: string;
  icon: string;
  run: () => void;
}

/** How many key controls show in a dock's body; the rest wait under More. */
export const KEYS_SHOWN = 5;

/** Draws the key controls `keys` in `dock`, the first few in its body and the rest under More. Gives back their buttons. */
export function fillDock(dock: ControlDock, keys: readonly KeyControl[]): HTMLButtonElement[] {
  dock.el.addClass('has-keys'); // a tablet folds it to a rail of these
  if (keys.length <= KEYS_SHOWN && dock.more.parentElement) dock.more.parentElement.hidden = true; // no empty More
  return keys.map((k, i) => {
    const b = button(i < KEYS_SHOWN ? dock.body : dock.more, k.name, k.icon, k.run, k.name);
    b.setAttribute('title', k.name); // where a dock shows its icons alone, its name is the tooltip (panels_compact)
    return b;
  });
}
