// The bar over the cards chosen together (render_cards). Shift-click or Cmd-click a card to choose it, and again to let
// it go. The bar sizes them all at once: name only, first lines, or all they hold. It pins them where they are, or
// gives them back to the layout. It can choose every card, or none.
import type { CardStep } from '../../card-choice.ts';
import { word, type WordKey } from '../../words.ts';
import { button } from '../button.ts';

/** What the chosen bar does: size the chosen cards, choose every card, or let them all go. */
export interface ChoiceActions {
  size: (step: CardStep) => void;
  every: () => void;
  pin: () => void;
  unpin: () => void;
  clear: () => void;
}

/** The steps, each with its words and icon. */
const STEPS: readonly [CardStep, WordKey, string][] = [
  ['title', 'view.cards.title', 'chevron-up'],
  ['lines', 'view.cards.lines', 'text'],
  ['full', 'view.cards.full', 'file-text'],
];

/**
 * The bar in `viewport` for `count` cards chosen, all at `step` (null when they differ), or none when none is chosen.
 * The bar drawn before is taken away by its caller.
 */
export function choiceBar(
  viewport: HTMLElement,
  count: number,
  step: CardStep | null,
  on: ChoiceActions,
): HTMLElement | null {
  if (!count) return null;
  const bar = viewport.createDiv({ cls: 'thoughtknot-stage-cards-chosen' });
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', word('view.cards.chosen', { count }));
  bar.createSpan({ cls: 'thoughtknot-stage-cards-count', text: word('view.cards.chosen', { count }) });
  for (const [s, w, icon] of STEPS) {
    const b = button(bar, word(w), icon, () => on.size(s));
    b.setAttribute('aria-pressed', String(step === s));
  }
  button(bar, word('view.cards.pin'), 'pin', on.pin);
  button(bar, word('view.cards.unpin-all'), 'pin-off', on.unpin);
  button(bar, word('view.cards.every'), 'check-square', on.every);
  button(bar, word('view.cards.none'), 'x', on.clear);
  // compact: each button names itself in its tooltip (Roger, 6 Nov 2026)
  for (const b of bar.querySelectorAll('button')) b.setAttribute('title', b.getAttribute('aria-label') ?? '');
  // the bar's own presses stay its own: the stage under it would take them as a pan or a click
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  return bar;
}
