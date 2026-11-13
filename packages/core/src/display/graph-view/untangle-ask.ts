// The filter by what things hold, at the top of the Filter panel (editor spec §25, untangle_ask_filter). A person picks
// a kind and tests on properties, from lists the graph fills, as in Highlight things. Where AI is on, they may write
// what they want instead. Or they write how to change it: add a test, take one out, or start again. The AI's answer only
// fills the rows, marked as written by AI until the person changes it. The count shows what it keeps. Nothing is shown
// until the person presses Show these, and nothing is ever written to the note.
import { word } from '@thoughtknot/core';
import type { GraphDrawing, NoteReading, RuleChoices, RuleDraft, RuleWrite } from '@thoughtknot/core';
import { blankFilter, filterKeeps, filterOfRule, filterReady, filterSaid } from '../../filter-ask.ts';
import { ruleChoices } from '../../rule-builder.ts';
import { button } from '../button.ts';
import { renderFind } from './rule-form-parts.ts';
import type { FormState } from './rule-form-parts.ts';

/** What the panel asks of its card. */
export interface FilterAskHost {
  choices: RuleChoices;
  /** How many things the filter keeps, of how many. */
  count: (draft: RuleDraft) => { kept: number; of: number };
  /** Shows the filter on the drawing, the rest faded or hidden; null clears it. */
  show: (draft: RuleDraft | null, hide: boolean) => void;
  /** Asks an AI for a filter from words, where the host can: the host shows what is sent and waits for a yes. */
  describe?: (words: string, fill: (rule: RuleWrite) => void) => void;
}

/** The panel, and how to open it on a filter already shown (the banner's Edit). */
export interface FilterAskPanel {
  el: HTMLElement;
  focus: () => void;
}

/** The words sent for `words`: as they are for a new filter, or with the filter as it is now, to be changed. */
export function askWords(draft: RuleDraft, words: string): string {
  return filterReady(draft) ? word('filter.ask.change', { now: filterSaid(draft), words }) : words;
}

/** Builds the panel at the end of `root`. */
export function renderFilterAsk(root: HTMLElement, host: FilterAskHost): FilterAskPanel {
  const el = root.createDiv({ cls: 'thoughtknot-filter-ask', attr: { role: 'group' } });
  el.setAttribute('aria-label', word('filter.ask.title'));
  el.createSpan({ cls: 'thoughtknot-rule-step', text: word('filter.ask.title') });
  const state: FormState = { draft: blankFilter(), meansTyped: false, whenTyped: false };
  let byAi = false;
  let input: HTMLInputElement | null = null;
  if (host.describe) {
    const row = el.createDiv({ cls: 'thoughtknot-rule-describe-row' });
    input = row.createEl('input', {
      attr: {
        name: 'filter-ask',
        type: 'text',
        placeholder: word('filter.ask.hint'),
        'aria-label': word('filter.ask.go'),
      },
    });
    button(row, word('filter.ask.go'), 'text', () => ask(), word('filter.ask.go'));
    // Enter asks, and never sends a form round it
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      ask();
    });
  }
  const find = el.createDiv({ cls: 'thoughtknot-rule-find' });
  const said = el.createDiv({ cls: 'thoughtknot-rule-word', attr: { role: 'status', 'aria-live': 'polite' } });
  const acts = el.createDiv({ cls: 'thoughtknot-filter-ask-acts' });
  const hideBox = acts.createEl('label', { cls: 'thoughtknot-filter-ask-hide' });
  const hide = hideBox.createEl('input', { attr: { type: 'checkbox' } });
  hideBox.createSpan({ text: word('filter.ask.hide') });
  const showButton = button(acts, word('filter.ask.show'), 'filter', () => show(), word('filter.ask.show'));
  button(acts, word('filter.ask.clear'), 'rotate-ccw', () => clear(), word('filter.ask.clear'));

  const tell = (extra = '') => {
    const ready = filterReady(state.draft);
    showButton.disabled = !ready;
    if (!ready) return said.setText(extra || word('filter.ask.empty'));
    const { kept, of } = host.count(state.draft);
    const counted = word('filter.ask.keeps', { count: kept, of });
    said.setText([extra, byAi ? word('filter.ask.by-ai') : '', counted].filter(Boolean).join(' '));
  };
  // a row changed by the person is theirs from then on
  const edited = () => {
    byAi = false;
    tell();
  };
  const redraw = () => renderFind(find, state, host.choices, edited);
  const show = () => {
    if (filterReady(state.draft)) host.show(state.draft, hide.checked);
  };
  const clear = () => {
    state.draft = blankFilter();
    byAi = false;
    redraw();
    host.show(null, false);
    tell();
  };
  const ask = () => {
    const words = input?.value.trim() ?? '';
    if (!words) return tell(word('filter.ask.no-words'));
    tell(word('filter.ask.asking'));
    host.describe?.(askWords(state.draft, words), (rule) => {
      const draft = filterOfRule(rule);
      if (!draft) return tell(word('filter.ask.not-filter'));
      state.draft = draft;
      byAi = true;
      redraw();
      tell(word('filter.ask.filled'));
    });
  };
  hide.addEventListener('change', () => {
    if (filterReady(state.draft)) show();
  });
  redraw();
  tell();
  return { el, focus: () => (input ?? find.querySelector('select'))?.focus() };
}

/** A filter shown on the drawing: as built, the drawn things it keeps, and whether the rest is hidden. */
export interface ShownAsk {
  draft: RuleDraft;
  /** The filter in plain words, for the banner. */
  said: string;
  things: Set<string>;
  hide: boolean;
}

/**
 * The panel first in the legend's panel `legend`, over the graph a card draws; null when the graph is not read. `show`
 * is told the filter to show, counted among the things drawn, or null to show all again.
 */
export function askPanelIn(
  legend: HTMLElement,
  card: { reading: NoteReading; graph: string; drawing: GraphDrawing; describe?: FilterAskHost['describe'] },
  show: (asked: ShownAsk | null) => void,
): FilterAskPanel | null {
  const g = card.reading.world[card.graph];
  if (!g) return null;
  const choices = ruleChoices(g);
  const drawn = new Set(card.drawing.boxes.map((b) => b.key));
  const kept = (draft: RuleDraft) => new Set(filterKeeps(g, draft, choices).filter((k) => drawn.has(k)));
  const panel = renderFilterAsk(legend, {
    choices,
    count: (draft) => ({ kept: kept(draft).size, of: drawn.size }),
    show: (draft, hide) => show(draft && { draft, said: filterSaid(draft), things: kept(draft), hide }),
    ...(card.describe && { describe: card.describe }),
  });
  legend.prepend(panel.el);
  return panel;
}
