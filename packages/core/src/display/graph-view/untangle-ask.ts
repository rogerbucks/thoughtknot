// The filter by what things hold, at the top of the Filter panel (editor spec §25, untangle_ask_filter). A person picks
// a kind and tests on properties, from lists the graph fills, as in Highlight things. Where AI is on, they may write
// what they want instead. Or they write how to change it: add a test, take one out, or start again. The AI's answer only
// fills the rows, marked as written by AI until the person changes it. The count shows what it keeps. Nothing is shown
// until the person presses Show these. Only a filter saved by name is written to the note, where it is edited
// (filter-named.ts). It can be picked again, or deleted with one Undo.
//
// Each question asked in words is a query (ES§75), listed under the ask box. It shows its words beside the filter they
// became, and the words can be changed to ask again (ai_query_words_kept). A hand edit of the rows marks them as no
// longer matching. Each query is shown as a filter or a highlight (ai_query_highlight), can be locked (ai_query_lock)
// and stepped back. A send that fails says why, keeps the words and leaves the drawing as it was (ai_query_fails_open).
// The query and its rules are filter.ts and filter-send.ts: the AI only turns words into a filter.
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, NoteReading, RuleChoices, RuleDraft, RuleWrite, SendResult } from '@thoughtknot/core';
import { blankFilter, filterKeeps, filterReady, filterSaid } from '../../filter-ask.ts';
import { queryAskWords, queryBack, queryEdited, queryLocked, querySaid, queryShown } from '../../filter.ts';
import type { Query, QueryShow } from '../../filter.ts';
import { queryResult } from '../../filter-send.ts';
import type { NamedFilters } from '../../filter-named.ts';
import { ruleChoices } from '../../rule-builder.ts';
import { button } from '../button.ts';
import { renderFind } from './rule-form-parts.ts';
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
  // the queries asked, the one the rows show, and the one on the drawing
  let queries: Query[] = [];
  let current: string | null = null;
  let shownId: string | null = null;
  let made = 0;
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
  const queryAt = (id: string | null) => queries.find((q) => q.id === id) ?? null;
  const put = (q: Query) => {
    queries = queries.some((p) => p.id === q.id) ? queries.map((p) => (p.id === q.id ? q : p)) : [...queries, q];
    drawList();
  };
  // a row changed by the person is theirs from then on; on a query, its words no longer match
  const edited = () => {
    byAi = false;
    const q = queryAt(current);
    if (q) {
      const draft = structuredClone(state.draft);
      const next = q.matches ? queryEdited(q, draft) : { ...q, draft };
      if ('refused' in next) {
        state.draft = structuredClone(q.draft);
        redraw();
        return tell(next.refused);
      }
      put(next);
    }
    tell();
  };
  // the rows of the query worked on, which cannot be changed while it is locked
  const redraw = () => {
    renderFind(find, state, host.choices, edited);
    const locked = !!queryAt(current)?.locked;
    for (const c of find.querySelectorAll('input, select, button')) (c as HTMLInputElement).disabled = locked;
  };
  const work = (q: Query | null) => {
    current = q?.id ?? null;
    state.draft = q ? structuredClone(q.draft) : blankFilter();
    redraw();
    drawList();
  };
  // a query shown again when how it is shown changes
  const showQuery = (q: Query) => {
    shownId = q.id;
    host.show(q.draft, hide.checked, { show: q.show, said: querySaid(q) });
  };
  const drawList = () =>
    queryList(list, queries, current, {
      ask: (q, words) => {
        work(q);
        askFor(q, words);
      },
      pick: (q) => {
        work(q);
        tell(word('filter.query.picked', { said: querySaid(q) }));
      },
      shown: (q, show) => {
        const next = queryShown(q, show);
        put(next);
        if (shownId === q.id) showQuery(next);
      },
      lock: (q) => {
        put(queryLocked(q, !q.locked));
        if (current === q.id) redraw();
      },
      back: (q) => {
        const next = queryBack(q);
        if ('refused' in next) return tell(next.refused);
        put(next);
        if (current === q.id) {
          state.draft = structuredClone(next.draft);
          redraw();
        }
        tell(word('filter.query.stepped'));
      },
    });
  // what came of asking: the query filled, or why not, with the words kept and the drawing as it was
  const settle = (id: string | null, words: string, result: SendResult) => {
    const asked = queryResult(queryAt(id), words, result, host.graph, host.choices, `query-${++made}`);
    if ('failed' in asked) return tell(asked.failed);
    put(asked.query);
    current = asked.query.id;
    state.draft = structuredClone(asked.query.draft);
    byAi = true;
    redraw();
    drawList();
    tell(word('filter.ask.filled'));
  };
  const askFor = (q: Query | null, words: string) => {
    const sent = queryAskWords(q, words);
    if (typeof sent !== 'string') return tell(sent.refused);
    tell(word('filter.ask.asking'));
    const id = q?.id ?? null;
    // the host hands back only the rule, or why there is none; queryResult needs no more of the send
    host.describe?.(
      sent,
      (rule) => settle(id, words, { rule } as SendResult),
      (why) => settle(id, words, { refused: why }),
    );
  };
  // a saved filter picked fills the rows as the person saved them; it is shown when they press Show these
  const pick = (draft: RuleDraft, name: string) => {
    current = null;
    drawList();
    state.draft = structuredClone(draft);
    byAi = false;
    redraw();
    tell(word('filter.saved.picked', { name }));
  };
  const nameIt = () =>
    saving && namePrompt(saved, filterSaid(state.draft), (name) => saving({ name, draft: state.draft }));
  const show = () => {
    if (!filterReady(state.draft)) return;
    const q = queryAt(current);
    if (q) return showQuery(q);
    shownId = null;
    host.show(state.draft, hide.checked);
  };
  // the rows start again and nothing is shown; the queries asked stay listed
  const clear = () => {
    byAi = false;
    shownId = null;
    work(null);
    host.show(null, false);
    tell();
  };
  const ask = () => {
    const words = input?.value.trim() ?? '';
    if (!words) return tell(word('filter.ask.no-words'));
    askFor(queryAt(current), words);
  };
  hide.addEventListener('change', () => {
    if (filterReady(state.draft)) show();
  });
  if (host.named) savedRow(saved, host.named, pick);
  redraw();
  tell();
  return { el, focus: () => (input ?? find.querySelector('select'))?.focus() };
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

/** What a person does to a query in the list. */
interface QueryActs {
  ask: (q: Query, words: string) => void;
  pick: (q: Query) => void;
  shown: (q: Query, show: QueryShow) => void;
  lock: (q: Query) => void;
  back: (q: Query) => void;
}

/**
 * The queries `qs` in `list`, `current` the one the rows show. Each holds its words, to change and ask again, beside
 * the filter they became. It says when the words no longer match, and shows a lock mark while locked. Then come how it
 * is shown, the lock, Step back, and a button to work on it in the rows.
 */
function queryList(list: HTMLElement, qs: readonly Query[], current: string | null, acts: QueryActs): void {
  list.empty();
  for (const q of qs) {
    const item = list.createDiv({ cls: 'thoughtknot-query', attr: { role: 'listitem' } });
    if (q.id === current) item.addClass('is-current');
    const words = item.createEl('input', {
      attr: { name: 'query-words', type: 'text', 'aria-label': word('filter.query.words') },
    });
    words.value = q.words;
    words.disabled = q.locked;
    words.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const said = words.value.trim();
      if (said) acts.ask(q, said);
    });
    const rule = [
      q.locked ? word('filter.query.lock-mark') : '',
      word('filter.query.became', { rule: filterSaid(q.draft) }),
      q.matches ? '' : word('filter.query.unmatched'),
    ];
    item.createDiv({ cls: 'thoughtknot-query-rule', text: rule.filter(Boolean).join(' ') });
    const row = item.createDiv({ cls: 'thoughtknot-query-acts' });
    const as = row.createEl('select', { attr: { name: 'query-show', 'aria-label': word('filter.query.show-as') } });
    as.createEl('option', { text: word('filter.query.as-filter'), attr: { value: 'filter' } });
    as.createEl('option', { text: word('filter.query.as-highlight'), attr: { value: 'highlight' } });
    as.value = q.show;
    as.addEventListener('change', () => acts.shown(q, as.value === 'highlight' ? 'highlight' : 'filter'));
    const lockLabel = word(q.locked ? 'filter.query.unlock' : 'filter.query.lock');
    const lock = button(row, lockLabel, q.locked ? 'lock' : 'unlock', () => acts.lock(q));
    lock.setAttribute('aria-pressed', String(q.locked));
    const back = button(row, word('filter.query.back'), 'undo-2', () => acts.back(q));
    back.disabled = q.locked || !q.back.length;
    const pick = button(row, word('filter.query.pick'), 'pencil', () => acts.pick(q));
    if (q.id === current) pick.setAttribute('aria-current', 'true');
  }
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
