// The queries asked in words, listed in the Filter panel under the ask box (editor spec ES§75). Each shows its words
// beside the filter they became, and the words can be changed to ask again (ai_query_words_kept). A hand edit of the
// rows marks them as no longer matching. Each query is shown as a filter or a highlight (ai_query_highlight), can be
// locked (ai_query_lock) and stepped back. A send that fails says why, keeps the words and leaves the drawing as it was
// (ai_query_fails_open). The query and its rules are filter.ts and filter-send.ts: the AI only turns words into a
// filter. The panel round it is untangle-ask.ts.
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { RuleChoices, RuleDraft, RuleWrite, SendResult } from '@thoughtknot/core';
import { blankFilter, filterSaid } from '../../filter-ask.ts';
import { queryAskWords, queryBack, queryEdited, queryLocked, querySaid, queryShown } from '../../filter.ts';
import type { Query, QueryMark, QueryShow } from '../../filter.ts';
import { queryResult } from '../../filter-send.ts';
import { button } from '../button.ts';
import type { FormState } from './rule-form-parts.ts';

/** What the list needs of the panel: the graph, the send, the drawing, and the rows it shares with the panel. */
export interface QueryHost {
  graph: Graph;
  choices: RuleChoices;
  describe?: (words: string, fill: (rule: RuleWrite) => void, fail?: (why: string) => void) => void;
  show: (draft: RuleDraft, hide: boolean, query: { show: QueryShow; said: string; mark?: QueryMark }) => void;
  /** The panel's rows, drawn again from `state` after it changes, and its status line. */
  state: FormState;
  redraw: () => void;
  tell: (extra?: string) => void;
  /** Whether the rows were just filled by an AI. */
  byAi: (on: boolean) => void;
  hidden: () => boolean;
}

/** The queries asked, the one the rows show, and the one on the drawing. */
export class QueryPanel {
  private queries: Query[] = [];
  private current: string | null = null;
  private shownId: string | null = null;
  private made = 0;

  constructor(
    private readonly list: HTMLElement,
    private readonly host: QueryHost,
  ) {}

  /** The query the rows show, if any. */
  worked(): Query | null {
    return this.at(this.current);
  }

  /** Asks for `words`: a refinement of the query worked on, or a new query. Refused while it is locked. */
  ask(words: string): void {
    this.askFor(this.worked(), words);
  }

  /** The rows were changed by hand: the query worked on takes them, its words marked as no longer matching. */
  edited(): void {
    const q = this.worked();
    if (!q) return;
    const draft = structuredClone(this.host.state.draft);
    const next = q.matches ? queryEdited(q, draft) : { ...q, draft };
    if ('refused' in next) {
      this.host.state.draft = structuredClone(q.draft);
      this.host.redraw();
      return this.host.tell(next.refused);
    }
    this.put(next);
  }

  /** Shows the query worked on, as it says to be shown; false when there is none. */
  show(): boolean {
    const q = this.worked();
    if (q) this.showQuery(q);
    else this.shownId = null;
    return !!q;
  }

  /** No query is worked on, or shown: the rows start again, or hold a saved filter. The queries stay listed. */
  release(): void {
    this.current = null;
    this.shownId = null;
    this.draw();
  }

  private at(id: string | null): Query | null {
    return this.queries.find((q) => q.id === id) ?? null;
  }

  private put(q: Query): void {
    const has = this.queries.some((p) => p.id === q.id);
    this.queries = has ? this.queries.map((p) => (p.id === q.id ? q : p)) : [...this.queries, q];
    this.draw();
  }

  private work(q: Query | null): void {
    this.current = q?.id ?? null;
    this.host.state.draft = q ? structuredClone(q.draft) : blankFilter();
    this.host.redraw();
    this.draw();
  }

  private showQuery(q: Query): void {
    this.shownId = q.id;
    this.host.show(q.draft, this.host.hidden(), { show: q.show, said: querySaid(q), mark: q.mark });
  }

  private draw(): void {
    queryList(this.list, this.queries, this.current, {
      ask: (q, words) => {
        this.work(q);
        this.askFor(q, words);
      },
      pick: (q) => {
        this.work(q);
        this.host.tell(word('filter.query.picked', { said: querySaid(q) }));
      },
      // only how it is shown changes, shown again at once when it is on the drawing
      shown: (q, show) => {
        const next = queryShown(q, show);
        this.put(next);
        if (this.shownId === q.id) this.showQuery(next);
      },
      lock: (q) => {
        this.put(queryLocked(q, !q.locked));
        if (this.current === q.id) this.host.redraw();
      },
      back: (q) => this.back(q),
    });
  }

  private back(q: Query): void {
    const next = queryBack(q);
    if ('refused' in next) return this.host.tell(next.refused);
    this.put(next);
    if (this.current === q.id) {
      this.host.state.draft = structuredClone(next.draft);
      this.host.redraw();
    }
    this.host.tell(word('filter.query.stepped'));
  }

  private askFor(q: Query | null, words: string): void {
    const sent = queryAskWords(q, words);
    if (typeof sent !== 'string') return this.host.tell(sent.refused);
    this.host.tell(word('filter.ask.asking'));
    const id = q?.id ?? null;
    // the host hands back only the rule, or why there is none; queryResult needs no more of the send
    this.host.describe?.(
      sent,
      (rule) => this.settle(id, words, { rule } as SendResult),
      (why) => this.settle(id, words, { refused: why }),
    );
  }

  /** What came of asking: the query filled, or why not, with the words kept and the drawing as it was. */
  private settle(id: string | null, words: string, result: SendResult): void {
    const { graph, choices } = this.host;
    const asked = queryResult(this.at(id), words, result, graph, choices, `query-${++this.made}`);
    if ('failed' in asked) return this.host.tell(asked.failed);
    this.put(asked.query);
    this.work(asked.query);
    this.host.byAi(true);
    this.host.tell(word('filter.ask.filled'));
  }
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
    const lock = button(row, lockLabel, 'lock', () => acts.lock(q)); // pressed while locked, as a board layer's
    lock.setAttribute('aria-pressed', String(q.locked));
    const back = button(row, word('filter.query.back'), 'undo-2', () => acts.back(q));
    back.disabled = q.locked || !q.back.length;
    const pick = button(row, word('filter.query.pick'), 'pencil', () => acts.pick(q));
    if (q.id === current) pick.setAttribute('aria-current', 'true');
  }
}
