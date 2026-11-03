// Poles on the overview of a graph too large to draw (editor spec §58, intent_poles_massive). A Poles button opens a
// list of the graph's intents. Ticking some places each group round them by its balance, and the groups glide there
// (core pole-groups.ts). Ticking none puts the overview back as it was laid out. Nothing is laid out again.
import { word } from '@thoughtknot/core';
import { button } from '../button';

/**
 * The Poles button and its list of `choices`, at the end of `parent`, with those `chosen` ticked. `changed` is given
 * the intents ticked, in the order listed, each time they change.
 */
export function polesPanel(
  parent: HTMLElement,
  choices: readonly { id: string; says: string }[],
  chosen: readonly string[],
  changed: (poles: string[]) => void,
): void {
  const panel = parent.createDiv({ cls: 'thoughtknot-massive-poles' });
  panel.hidden = true;
  const toggle = button(
    parent,
    word('massive.poles'),
    'magnet',
    () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    },
    word('massive.poles'),
  );
  toggle.setAttribute('aria-expanded', 'false');
  parent.insertBefore(toggle, panel);
  const boxes = choices.map((c) => {
    const box = panel.createEl('label').createEl('input', { attr: { type: 'checkbox', value: c.id } });
    box.checked = chosen.includes(c.id);
    box.parentElement?.appendText(c.says);
    return box;
  });
  for (const box of boxes)
    box.addEventListener('change', () => changed(boxes.filter((b) => b.checked).map((b) => b.value)));
}
