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
import { FIRST_MARK, queryKeeps, queryLegend, queryMarked, querySaid } from '../../filter.ts';
import type { Query, QueryLegendEntry, QueryShow } from '../../filter.ts';
import type { AskedFilter } from '../../filter-ask.ts';
import { markedBy } from '../../query-marks.ts';
import type { Marked } from '../../query-marks.ts';
import type { NamedFilters } from '../../filter-named.ts';
import { savedQueryFrom } from '../../filter-manage.ts';
import type { SavedQuery } from '../../filter-manage.ts';
import { askedAgain, savedQueryOpened } from '../../filter-replay.ts';
import { ruleChoices } from '../../rule-builder.ts';
import { button } from '../button.ts';
import { renderFind } from './rule-form-parts.ts';
import { QueryPanel } from './filter-query-list.ts';
import { savedQueryList } from './untangle-saved.ts';
export { untangledIn } from './stage-untangle.ts';
import type { FormState } from './rule-form-parts.ts';

/** What the panel asks of its card. */
export interface FilterAskHost {
  /** The graph the filter is on: a query's answer is taken only when it keeps something here. */
  graph: Graph;
  choices: RuleChoices;
  /** How many things the filter keeps, of how many; a merged query's by its parts. */
  count: (draft: RuleDraft, query?: Query) => { kept: number; of: number };
  /**
   * Shows the filter on the drawing, the rest faded or hidden; null clears it. A query says how it is shown, as a filter
   * or a highlight, what it is called, and the mark of each part.
   */
  show: (draft: RuleDraft | null, hide: boolean, query?: Query) => void;
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
  /** The drawing shows no filter now: a later change to a query does not show it again. */
  off: () => void;
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
  const kept = el.createDiv({ cls: 'thoughtknot-saved-queries-row' });
  const find = el.createDiv({ cls: 'thoughtknot-rule-find' });
  const said = el.createDiv({ cls: 'thoughtknot-rule-word', attr: { role: 'status', 'aria-live': 'polite' } });
  const acts = el.createDiv({ cls: 'thoughtknot-filter-ask-acts' });
  const hideBox = acts.createEl('label', { cls: 'thoughtknot-filter-ask-hide' });
  const hide = hideBox.createEl('input', { attr: { type: 'checkbox' } });
  hideBox.createSpan({ text: word('filter.ask.hide') });
  const showButton = button(acts, word('filter.ask.show'), 'filter', () => show(), word('filter.ask.show'));
  button(acts, word('filter.ask.clear'), 'rotate-ccw', () => clear(), word('filter.ask.clear'));
  const saving = host.named?.save;
  const qs = host.named?.queries;
  const savingQuery = qs?.save;
  const saveButton = (saving || savingQuery) && button(acts, word('filter.saved.save'), 'bookmark', () => nameIt());

  // a merged query worked on whole is counted, and shown, by its parts; it is saved only as a query (ES§75)
  const tell = (extra = '') => {
    const whole = queries.whole();
    const ready = !!whole || filterReady(state.draft);
    showButton.disabled = !ready;
    if (saveButton) saveButton.disabled = !ready || (!!whole && !savingQuery);
    if (!ready) return said.setText(extra || word('filter.ask.empty'));
    const { kept, of } = host.count(state.draft, whole ?? undefined);
    const counted = word('filter.ask.keeps', { count: kept, of });
    said.setText([extra, byAi ? word('filter.ask.by-ai') : '', counted].filter(Boolean).join(' '));
  };
  // a row changed by the person is theirs from then on; on a query, its words no longer match
  const edited = () => {
    byAi = false;
    queries.edited();
    tell();
  };
  // the rows of the query worked on, which cannot be changed while it is locked, or merged and worked on whole
  const redraw = () => {
    renderFind(find, state, host.choices, edited);
    const fixed = queries.fixed();
    for (const c of find.querySelectorAll('input, select, button')) (c as HTMLInputElement).disabled = fixed;
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
    ...(qs?.answers && { answers: qs.answers }),
  });
  // a saved filter picked fills the rows as the person saved them; it is shown when they press Show these
  const pick = (draft: RuleDraft, name: string) => {
    queries.release();
    state.draft = structuredClone(draft);
    byAi = false;
    redraw();
    tell(word('filter.saved.picked', { name }));
  };
  // a query worked on is saved whole, with its prompts, look and lock; else the rows are saved as a filter
  const nameIt = () => {
    const held = queries.held();
    if (held && savingQuery)
      return namePrompt(saved, querySaid(held), (name) => savingQuery(savedQueryFrom(name, held)));
    // a saved query's filter line is its own: saving a plain filter over it would change its rule unseen
    const save = (name: string) =>
      qs?.saved.some((q) => q.name === name.trim())
        ? tell(word('filter.saved-query.taken', { name }))
        : saving?.({ name, draft: state.draft });
    if (saving) namePrompt(saved, filterSaid(state.draft), save);
  };
  // a saved query opened runs its rule on the graph as it is now, with nothing sent (ai_query_replay)
  const open = (s: SavedQuery) => {
    const o = savedQueryOpened(s, queries.fresh(), host.choices);
    if ('broken' in o) return tell(o.broken);
    byAi = false;
    queries.adopt(o.query);
    tell(o.stale ?? word('filter.saved-query.opened', { name: s.name }));
  };
  // Ask again sends only after the person says yes to each prompt it will send, in order
  const again = async (s: SavedQuery) => {
    if (!qs) return;
    const deps = { now: host.graph, choices: host.choices, confirm: qs.confirm, ask: queries.asker() };
    const out = await askedAgain(s, queries.fresh(), { ...deps, ...(qs.answers && { cache: qs.answers }) });
    if (!('query' in out)) return tell('failed' in out ? out.failed : out.declined);
    byAi = true;
    queries.adopt(out.query);
    tell(word('filter.ask.filled'));
  };
  const show = () => {
    if (queries.whole() || filterReady(state.draft)) {
      if (!queries.show()) host.show(state.draft, hide.checked);
    }
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
  hide.addEventListener('change', () => show());
  if (host.named) savedRow(saved, host.named, pick);
  if (qs) savedQueryList(kept, qs, host.choices, { open, tell, ...(host.describe && { again: (s) => void again(s) }) });
  redraw();
  tell();
  return { el, focus: () => (input ?? find.querySelector('select'))?.focus(), off: () => queries.off() };
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
  /** What a highlight marks, each thing with the badge and colour of each part that finds it (query-marks.ts). */
  marked?: Marked;
  /** The legend of a highlight: each part's mark and what it is called (ES§75, ai_query_merge). */
  legend?: readonly QueryLegendEntry[];
}

/** What the untangling shows for `asked`: a filter fades or hides, and a highlight only marks (ES§75, query-marks.ts). */
export function askedOf(asked: ShownAsk | null): { asked: AskedFilter | null; lit: Marked | null } {
  if (asked?.show === 'filter') return { asked: { things: asked.things, hide: asked.hide }, lit: null };
  return { asked: null, lit: asked ? (asked.marked ?? markedBy(asked.things, FIRST_MARK)) : null };
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
  // a query is kept by its own filter, or its parts joined: worked out afresh, and counted among the things drawn
  const kept = (draft: RuleDraft, q?: Query) =>
    new Set([...(q ? queryKeeps(g, q, choices) : filterKeeps(g, draft, choices))].filter((k) => drawn.has(k)));
  const panel = renderFilterAsk(legend, {
    choices,
    graph: g,
    count: (draft, q) => ({ kept: kept(draft, q).size, of: drawn.size }),
    show: (draft, hide, q) =>
      show(
        draft && {
          draft,
          said: q ? querySaid(q) : filterSaid(draft),
          things: kept(draft, q),
          hide,
          show: q?.show ?? 'filter',
          ...(q && { marked: queryMarked(g, q, choices), legend: queryLegend(q) }),
        },
      ),
    ...(card.describe && { describe: card.describe }),
    ...(card.named && { named: card.named }),
  });
  legend.prepend(panel.el);
  return panel;
}
