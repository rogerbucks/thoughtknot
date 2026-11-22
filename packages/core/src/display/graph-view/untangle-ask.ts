// The filter by what things hold, at the top of the Filter panel (editor spec §25, untangle_ask_filter). A person picks
// a kind and tests on properties, from lists the graph fills, as in Highlight things. Where AI is on, they may write
// what they want instead. Or they write how to change it: add a test, take one out, or start again. The AI's answer only
// fills the rows, marked as written by AI until the person changes it. The count shows what it keeps. Nothing is shown
// until the person presses Show these. Only a filter saved by name is written to the note, where it is edited
// (filter-named.ts). It can be picked again, or deleted with one Undo.
//
// Each question asked in words is a query (ES§75), listed under the ask box (filter-query-list.ts).
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, NoteReading, RuleChoices, RuleDraft, RuleWrite } from '@thoughtknot/core';
import { blankFilter, filterKeeps, filterReady, filterSaid } from '../../filter-ask.ts';
import type { QueryShow } from '../../filter.ts';
import type { NamedFilters } from '../../filter-named.ts';
import { ruleChoices } from '../../rule-builder.ts';
import { button } from '../button.ts';
import { renderFind } from './rule-form-parts.ts';
import { QueryPanel } from './filter-query-list.ts';
export { untangledIn } from './stage-untangle.ts';
import type { FormState } from './rule-form-parts.ts';

/** What the panel asks of its card. */
export interface FilterAskHost {
  /** The graph the filter is on: a query's answer is taken only when it keeps something here. */
  graph: Graph;
  choices: RuleChoices;
  /** How many things the filter keeps, of how many. */
  count: (draft: RuleDraft) => { kept: number; of: number };
  /**
   * Shows the filter on the drawing, the rest faded or hidden; null clears it. A query says how it is shown, as a filter
   * or a highlight, and what it is called.
   */
  show: (draft: RuleDraft | null, hide: boolean, query?: { show: QueryShow; said: string }) => void;
  /**
   * Asks an AI for a filter from words, where the host can: the host shows what is sent and waits for a yes. A send
   * that comes to no rule is told to `fail`, in words, where the host can.
   */
  describe?: (words: string, fill: (rule: RuleWrite) => void, fail?: (why: string) => void) => void;
  /** The filters saved by name in the note, and how to save or delete one where it is edited. */
  named?: NamedFilters;
}

/** The panel, and how to open it on a filter already shown (the banner's Edit). */
export interface FilterAskPanel {
  el: HTMLElement;
  focus: () => void;
}

/** Builds the panel at the end of `root`. */
export function renderFilterAsk(root: HTMLElement, host: FilterAskHost): FilterAskPanel {
  const el = root.createDiv({ cls: 'thoughtknot-filter-ask', attr: { role: 'group' } });
  el.setAttribute('aria-label', word('filter.ask.title'));
  el.createSpan({ cls: 'thoughtknot-rule-step', text: word('filter.ask.title') });
  const state: FormState = { draft: blankFilter(), meansTyped: false, whenTyped: false };
  let byAi = false;
  const input = host.describe ? askBox(el, () => ask()) : null;
  const list = el.createDiv({
    cls: 'thoughtknot-query-list',
    attr: { role: 'list', 'aria-label': word('filter.query.list') },
  });
  const saved = el.createDiv({ cls: 'thoughtknot-filter-saved' });
  const find = el.createDiv({ cls: 'thoughtknot-rule-find' });
  const said = el.createDiv({ cls: 'thoughtknot-rule-word', attr: { role: 'status', 'aria-live': 'polite' } });
  const acts = el.createDiv({ cls: 'thoughtknot-filter-ask-acts' });
  const hideBox = acts.createEl('label', { cls: 'thoughtknot-filter-ask-hide' });
  const hide = hideBox.createEl('input', { attr: { type: 'checkbox' } });
  hideBox.createSpan({ text: word('filter.ask.hide') });
  const showButton = button(acts, word('filter.ask.show'), 'filter', () => show(), word('filter.ask.show'));
  button(acts, word('filter.ask.clear'), 'rotate-ccw', () => clear(), word('filter.ask.clear'));
  const saving = host.named?.save;
  const saveButton = saving && button(acts, word('filter.saved.save'), 'bookmark', () => nameIt());

  const tell = (extra = '') => {
    const ready = filterReady(state.draft);
    showButton.disabled = !ready;
    if (saveButton) saveButton.disabled = !ready;
    if (!ready) return said.setText(extra || word('filter.ask.empty'));
    const { kept, of } = host.count(state.draft);
    const counted = word('filter.ask.keeps', { count: kept, of });
    said.setText([extra, byAi ? word('filter.ask.by-ai') : '', counted].filter(Boolean).join(' '));
  };
  // a row changed by the person is theirs from then on; on a query, its words no longer match
  const edited = () => {
    byAi = false;
    queries.edited();
    tell();
  };
  // the rows of the query worked on, which cannot be changed while it is locked
  const redraw = () => {
    renderFind(find, state, host.choices, edited);
    const locked = !!queries.worked()?.locked;
    for (const c of find.querySelectorAll('input, select, button')) (c as HTMLInputElement).disabled = locked;
  };
  const queries = new QueryPanel(list, {
    graph: host.graph,
    choices: host.choices,
    ...(host.describe && { describe: host.describe }),
    show: (draft, hidden, query) => host.show(draft, hidden, query),
    state,
    redraw,
    tell,
    byAi: (on) => (byAi = on),
    hidden: () => hide.checked,
  });
  // a saved filter picked fills the rows as the person saved them; it is shown when they press Show these
  const pick = (draft: RuleDraft, name: string) => {
    queries.release();
    state.draft = structuredClone(draft);
    byAi = false;
    redraw();
    tell(word('filter.saved.picked', { name }));
  };
  const nameIt = () =>
    saving && namePrompt(saved, filterSaid(state.draft), (name) => saving({ name, draft: state.draft }));
  const show = () => {
    if (filterReady(state.draft) && !queries.show()) host.show(state.draft, hide.checked);
  };
  // the rows start again and nothing is shown; the queries asked stay listed
  const clear = () => {
    byAi = false;
    queries.release();
    state.draft = blankFilter();
    redraw();
    host.show(null, false);
    tell();
  };
  const ask = () => {
    const words = input?.value.trim() ?? '';
    if (!words) return tell(word('filter.ask.no-words'));
    queries.ask(words);
  };
  hide.addEventListener('change', () => {
    if (filterReady(state.draft)) show();
  });
  if (host.named) savedRow(saved, host.named, pick);
  redraw();
  tell();
  return { el, focus: () => (input ?? find.querySelector('select'))?.focus() };
}

/** The box to write what to see in, and Ask AI, at the end of `el`; Enter asks too, and never sends a form round it. */
function askBox(el: HTMLElement, ask: () => void): HTMLInputElement {
  const row = el.createDiv({ cls: 'thoughtknot-rule-describe-row' });
  const input = row.createEl('input', {
    attr: {
      name: 'filter-ask',
      type: 'text',
      placeholder: word('filter.ask.hint'),
      'aria-label': word('filter.ask.go'),
    },
  });
  button(row, word('filter.ask.go'), 'text', ask, word('filter.ask.go'));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    ask();
  });
  return input;
}

/** The saved filters to pick in `row`, and Delete for the one picked where the note is edited; none, nothing. */
function savedRow(row: HTMLElement, named: NamedFilters, pick: (draft: RuleDraft, name: string) => void): void {
  if (!named.saved.length) return;
  const list = row.createEl('select', { attr: { name: 'filter-saved', 'aria-label': word('filter.saved.pick') } });
  list.createEl('option', { text: word('filter.saved.pick'), attr: { value: '' } });
  for (const f of named.saved) list.createEl('option', { text: f.name, attr: { value: f.name } });
  const remove = named.remove;
  const del = remove && button(row, word('filter.saved.delete'), 'trash-2', () => list.value && remove(list.value));
  if (del) del.disabled = true;
  list.addEventListener('change', () => {
    const f = named.saved.find((s) => s.name === list.value);
    if (del) del.disabled = !f;
    if (f) pick(f.draft, f.name);
  });
}

/** Asks in `row` for the name to save the filter by, `said` to start with; Enter or Save saves it. */
function namePrompt(row: HTMLElement, said: string, save: (name: string) => void): void {
  row.querySelector('.thoughtknot-filter-name')?.remove();
  const box = row.createDiv({ cls: 'thoughtknot-filter-name thoughtknot-rule-describe-row' });
  const input = box.createEl('input', {
    attr: { name: 'filter-name', type: 'text', value: said, 'aria-label': word('filter.saved.name') },
  });
  const go = () => {
    const name = input.value.trim();
    if (name) save(name);
  };
  button(box, word('filter.saved.keep'), 'check', go, word('filter.saved.keep'));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    go();
  });
  input.focus();
  input.select();
}

/** A filter shown on the drawing: as built, the drawn things it keeps, and whether the rest is hidden. */
export interface ShownAsk {
  draft: RuleDraft;
  /** The filter in plain words, for the banner. */
  said: string;
  things: Set<string>;
  hide: boolean;
  /** Shown as a filter, the rest fades or hides; as a highlight, nothing does (ES§75, ai_query_highlight). */
  show: QueryShow;
}

/**
 * The panel first in the legend's panel `legend`, over the graph a card draws; null when the graph is not read. `show`
 * is told the filter to show, counted among the things drawn, or null to show all again.
 */
export function askPanelIn(
  legend: HTMLElement,
  card: { reading: NoteReading; graph: string; drawing: GraphDrawing } & Pick<FilterAskHost, 'describe' | 'named'>,
  show: (asked: ShownAsk | null) => void,
): FilterAskPanel | null {
  const g = card.reading.world[card.graph];
  if (!g) return null;
  const choices = ruleChoices(g);
  const drawn = new Set(card.drawing.boxes.map((b) => b.key));
  const kept = (draft: RuleDraft) => new Set(filterKeeps(g, draft, choices).filter((k) => drawn.has(k)));
  const panel = renderFilterAsk(legend, {
    choices,
    graph: g,
    count: (draft) => ({ kept: kept(draft).size, of: drawn.size }),
    show: (draft, hide, query) =>
      show(
        draft && {
          draft,
          said: query?.said ?? filterSaid(draft),
          things: kept(draft),
          hide,
          show: query?.show ?? 'filter',
        },
      ),
    ...(card.describe && { describe: card.describe }),
    ...(card.named && { named: card.named }),
  });
  legend.prepend(panel.el);
  return panel;
}
