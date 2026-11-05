// The describe box of the Highlight things form (editor spec §56, rule_look_describe). A person writes what they want
// to see, in their own words. The host asks an AI, after showing what is sent and getting a yes (rule-describe.ts). The
// rule that comes back only fills the form's three steps. The live count of what it finds shows at once. Nothing is
// tried or saved until the person does it. Shown only where the host can ask.
import { word } from '@thoughtknot/core';
import type { RuleAsk, RuleWrite } from '@thoughtknot/core';
import { button } from '../button.ts';

/**
 * The box, at the end of `parent`: words to write, and a button that hands them to `ask.describe`. `fill` takes the
 * rule that comes back and fills the form with it. Says plainly that it was filled in and still has to be applied.
 */
export function renderDescribe(parent: HTMLElement, ask: RuleAsk, fill: (rule: RuleWrite) => void): void {
  if (!ask.describe) return;
  parent.createSpan({ cls: 'thoughtknot-rule-step', text: word('rules.describe') });
  const row = parent.createDiv({ cls: 'thoughtknot-rule-describe-row' });
  const words = row.createEl('input', {
    attr: {
      name: 'describe',
      type: 'text',
      placeholder: word('rules.describe-hint'),
      'aria-label': word('rules.describe'),
    },
  });
  const said = parent.createDiv({ cls: 'thoughtknot-rule-word', attr: { role: 'status', 'aria-live': 'polite' } });
  const go = () => {
    if (!words.value.trim()) return said.setText(word('rules.describe-empty'));
    said.setText(word('rules.describe-asking'));
    ask.describe?.(words.value, (rule) => {
      fill(rule);
      said.setText(word('rules.describe-filled'));
    });
  };
  button(row, word('rules.describe-go'), 'text', go, word('rules.describe-go'));
  // Enter asks, and never sends the form
  words.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    go();
  });
}
