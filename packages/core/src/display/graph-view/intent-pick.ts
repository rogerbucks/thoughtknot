// Showing an intent over the drawing (editor spec §58, intent_overlay). Beside the rules' legend, a graph that holds
// intents has a short list to pick one. The card then marks each thing by how it pulls on it, and says the intent's
// standing in words. Picking None takes the marks off. It only draws, so it works in reading view too, and nothing
// moves or is written.
import { word } from '@thoughtknot/core';
import type { IntentAsk } from '@thoughtknot/core';

/** The class of the list and the standing line beside it. */
export const INTENT_PICK = 'thoughtknot-intent-pick';

/** The list that picks the intent shown, in `slot`, and its standing under it; nothing when the graph has no intent. */
export function renderIntentPick(slot: HTMLElement, ask: IntentAsk | undefined): void {
  if (!ask?.choices.length) return;
  const box = slot.createDiv({ cls: INTENT_PICK });
  const label = word('intent.show');
  const select = box.createEl('label', { text: label }).createEl('select', {
    cls: 'dropdown',
    attr: { 'aria-label': label },
  });
  select.createEl('option', { text: word('intent.show.none'), attr: { value: '' } });
  for (const c of ask.choices) {
    const option = select.createEl('option', { text: c.says, attr: { value: c.id } });
    if (c.id === ask.chosen) option.selected = true;
  }
  select.addEventListener('change', () => ask.choose(select.value || null));
  if (ask.chosen && ask.said)
    box.createDiv({ cls: `${INTENT_PICK}-standing`, attr: { role: 'status' }, text: ask.said });
}
