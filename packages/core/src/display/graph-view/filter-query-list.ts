// The queries asked in words, listed in the Filter panel under the ask box (editor spec ES§75). Each shows its words
// beside the filter they became, and the words can be changed to ask again (ai_query_words_kept). A hand edit of the
// rows marks them as no longer matching. Each query is shown as a filter or a highlight (ai_query_highlight), can be
// locked (ai_query_lock) and stepped back. A send that fails says why, keeps the words and leaves the drawing as it was
// (ai_query_fails_open). Two or more can be chosen and merged, all of them or any (ai_query_merge). The merged query
// holds a copy of each part, so changing another query never changes it. Each part has its own mark, can be worked on
// in the rows, and taken out again. The query and its rules are filter.ts and filter-send.ts: the AI only turns words
// into a filter. Merging runs here, with nothing sent. The panel round it is untangle-ask.ts.
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { RuleChoices, RuleDraft, RuleWrite, SendResult } from '@thoughtknot/core';
import { blankFilter, filterReady, filterSaid } from '../../filter-ask.ts';
import { filterWords, queryAskWords, queryBack, queryEdited, queryJoined, queryLocked } from '../../filter.ts';
import { queryPart, queryPartOut, querySaid, queryShown, queriesMerged } from '../../filter.ts';
import type { Query, QueryJoin, QueryRefused, QueryShow } from '../../filter.ts';
import { queryResult } from '../../filter-send.ts';
import { button } from '../button.ts';
import type { FormState } from './rule-form-parts.ts';
import { legendBadge } from './untangle-query-legend.ts';

/** Whether every filter of `q` is ready: its own, or each of its parts'. */
const ready = (q: Query): boolean => (q.parts ? q.parts.every(ready) : filterReady(q.draft));

/** Which query the rows show: a query listed, or one part of a merged one. */
interface Target {
  id: string;
  part?: string;
}

/** What the list needs of the panel: the graph, the send, the drawing, and the rows it shares with the panel. */
export interface QueryHost {
  graph: Graph;
  choices: RuleChoices;
  describe?: (words: string, fill: (rule: RuleWrite) => void, fail?: (why: string) => void) => void;
  /** Shows `query` on the drawing: its own filter, or its parts joined, each with its own mark. */
  show: (draft: RuleDraft, hide: boolean, query: Query) => void;
  /** The panel's rows, drawn again from `state` after it changes, and its status line. */
  state: FormState;
  redraw: () => void;
  tell: (extra?: string) => void;
  /** Whether the rows were just filled by an AI. */
  byAi: (on: boolean) => void;
  hidden: () => boolean;
}

/** The queries asked, the one the rows show, the ones chosen to merge, and the one on the drawing. */
export class QueryPanel {
  private queries: Query[] = [];
  private current: Target | null = null;
  private shownId: string | null = null;
  private readonly chosen = new Set<string>();
  private join: QueryJoin = 'all';
  private made = 0;

  constructor(
    private readonly list: HTMLElement,
    private readonly host: QueryHost,
  ) {}

  /** The query the rows show, if any: a query listed, or one part of a merged one. */
  worked(): Query | null {
    return this.at(this.current);
  }

  /** The merged query worked on as a whole, if any, a part merged itself too: it has no rows, only its parts. */
  whole(): Query | null {
    const q = this.worked();
    return q?.parts ? q : null;
  }

  /** Whether the rows cannot be changed: the query is locked, or merged and worked on as a whole. */
  fixed(): boolean {
    return !!this.top()?.locked || !!this.whole();
  }

  /** Asks for `words`: a refinement of the query worked on, or a new query. Refused while it is locked. */
  ask(words: string): void {
    this.askFor(this.current, words);
  }

  /** The rows were changed by hand: the query worked on takes them, its words marked as no longer matching. */
  edited(): void {
    const q = this.worked();
    if (!q || !this.current) return;
    const draft = structuredClone(this.host.state.draft);
    const next = q.matches ? queryEdited(q, draft) : { ...q, draft };
    const placed = 'refused' in next ? next : this.place(this.current, next, q.matches);
    if (!('refused' in placed)) return;
    this.host.state.draft = structuredClone(q.draft);
    this.host.redraw();
    this.host.tell(placed.refused);
  }

  /** Shows the query worked on, a merged one whole, as it says to be shown; false when there is none. */
  show(): boolean {
    const q = this.top();
    if (q) this.showQuery(q);
    else this.shownId = null;
    return !!q;
  }

  /** Nothing is shown any more, as the banner's Off says: a later change to a query does not show it again. */
  off(): void {
    this.shownId = null;
  }

  /** No query is worked on, or shown: the rows start again, or hold a saved filter. The queries stay listed. */
  release(): void {
    this.current = null;
    this.shownId = null;
    this.draw();
  }

  private at(t: Target | null): Query | null {
    const top = this.queries.find((q) => q.id === t?.id) ?? null;
    return t?.part ? (top?.parts?.find((p) => p.id === t.part) ?? null) : top;
  }

  private top(): Query | null {
    return this.current && this.at({ id: this.current.id });
  }

  /**
   * `q` put in the list, in its place or at the end. With `again`, a query on the drawing is shown again at once. It
   * waits until every filter in it is ready, so a row half written never empties the drawing.
   */
  private put(q: Query, again = false): void {
    const has = this.queries.some((p) => p.id === q.id);
    this.queries = has ? this.queries.map((p) => (p.id === q.id ? q : p)) : [...this.queries, q];
    if (again && this.shownId === q.id && ready(q)) this.showQuery(q);
    this.draw();
  }

  /** `q` put where `t` says: a query listed, or a part of a merged one, the change kept to step back to if `step`. */
  private place(t: Target, q: Query, step = true): Query | QueryRefused {
    const top = this.at({ id: t.id });
    if (!t.part || !top?.parts) {
      this.put(q);
      return q;
    }
    if (top.locked) return { refused: word('filter.query.locked') };
    const next = step
      ? queryPart(top, t.part, () => q)
      : { ...top, parts: top.parts.map((p) => (p.id === t.part ? q : p)) };
    if (!('refused' in next)) this.put(next, true); // a merged query on the drawing shows its parts as they change
    return next;
  }

  /** The rows show `t`: its filter, or none for a merged query worked on whole. A part gone falls back to its query. */
  private work(t: Target | null): void {
    const top = t && this.at({ id: t.id });
    this.current = top && t ? (this.at(t) ? t : { id: t.id }) : null;
    const q = this.worked();
    this.host.state.draft = q && !this.whole() ? structuredClone(q.draft) : blankFilter();
    this.host.redraw();
    this.draw();
  }

  private showQuery(q: Query): void {
    this.shownId = q.id;
    this.host.show(q.draft, this.host.hidden(), q);
  }

  private draw(): void {
    const view = { qs: this.queries, current: this.current, chosen: this.chosen, join: this.join };
    queryList(this.list, view, {
      ask: (t, words) => {
        this.work(t);
        this.askFor(t, words);
      },
      pick: (t) => {
        this.work(t);
        const q = this.worked();
        const said = q ? word('filter.query.picked', { said: querySaid(q) }) : '';
        this.host.tell(this.whole() ? `${said} ${word('filter.query.whole')}` : said);
      },
      shown: (q, show) => this.put(queryShown(q, show), true),
      lock: (q) => {
        this.put(queryLocked(q, !q.locked));
        if (this.current?.id === q.id) this.host.redraw();
      },
      back: (q) => this.back(q),
      choose: (q, on) => {
        if (on) this.chosen.add(q.id);
        else this.chosen.delete(q.id);
        this.draw();
      },
      joinAs: (join) => (this.join = join),
      merge: () => this.merge(),
      joined: (q, join) => this.settled(queryJoined(q, join)),
      partOut: (q, part) => this.partOut(q, part),
    });
  }

  /** A change to a query listed, put in its place, or why it was refused. */
  private settled(next: Query | QueryRefused): void {
    if ('refused' in next) return this.host.tell(next.refused);
    this.put(next, true);
    this.host.tell();
  }

  /** The queries chosen, merged into a new one as they now stand, worked on whole. Nothing is sent. */
  private merge(): void {
    // a part is locked only with the merge it is in, so each comes in unlocked
    const qs = this.queries.filter((q) => this.chosen.has(q.id)).map((q) => queryLocked(q, false));
    const merged = queriesMerged(`query-${++this.made}`, qs, this.join);
    if ('refused' in merged) return this.host.tell(merged.refused);
    this.chosen.clear();
    this.put(merged);
    this.work({ id: merged.id });
    this.host.tell(word('filter.query.merged', { count: qs.length }));
  }

  /** The part `part` of `q` taken out. With one part left, it stands alone in the merged query's place, shown as it was. */
  private partOut(q: Query, part: string): void {
    const gone = q.parts?.find((p) => p.id === part);
    const out = queryPartOut(q, part);
    if ('refused' in out || !gone) return this.host.tell('refused' in out ? out.refused : word('filter.query.no-part'));
    // it keeps the merged query's place, look and changes, so Step back merges it again
    const was = { words: q.words, draft: q.draft, matches: q.matches, parts: q.parts, join: q.join };
    const alone = out.id !== q.id; // the part left, which may be merged itself
    const next = alone ? { ...out, id: q.id, show: q.show, hide: q.hide, back: [...q.back, was] } : out;
    this.put(next, true);
    const kept = !alone && this.current?.part !== part ? this.current?.part : undefined;
    if (this.current?.id === q.id) this.work(kept ? { id: q.id, part: kept } : { id: q.id });
    this.host.tell(word('filter.query.part-taken', { said: querySaid(gone) }));
  }

  private back(q: Query): void {
    const next = queryBack(q);
    if ('refused' in next) return this.host.tell(next.refused);
    this.put(next, !!(next.parts || q.parts)); // a merge's drawing follows its parts, as when they change
    if (this.current?.id === q.id) this.work(this.current);
    this.host.tell(word('filter.query.stepped'));
  }

  private askFor(t: Target | null, words: string): void {
    // a part of a locked merge is locked with it
    if (t && this.at({ id: t.id })?.locked) return this.host.tell(word('filter.query.locked'));
    const sent = queryAskWords(this.at(t), words);
    if (typeof sent !== 'string') return this.host.tell(sent.refused);
    this.host.tell(word('filter.ask.asking'));
    // the host hands back only the rule, or why there is none; queryResult needs no more of the send
    this.host.describe?.(
      sent,
      (rule) => this.settle(t, words, { rule } as SendResult),
      (why) => this.settle(t, words, { refused: why }),
    );
  }

  /** What came of asking: the query filled, or why not, with the words kept and the drawing as it was. */
  private settle(t: Target | null, words: string, result: SendResult): void {
    const { graph, choices } = this.host;
    const asked = queryResult(this.at(t), words, result, graph, choices, `query-${++this.made}`);
    if ('failed' in asked) return this.host.tell(asked.failed);
    const placed = this.place(t ?? { id: asked.query.id }, asked.query);
    if ('refused' in placed) return this.host.tell(placed.refused);
    this.work(t ?? { id: asked.query.id });
    this.host.byAi(true);
    this.host.tell(word('filter.ask.filled'));
  }
}

/** What a person does to a query in the list. */
interface QueryActs {
  ask: (t: Target, words: string) => void;
  pick: (t: Target) => void;
  shown: (q: Query, show: QueryShow) => void;
  lock: (q: Query) => void;
  back: (q: Query) => void;
  choose: (q: Query, on: boolean) => void;
  joinAs: (join: QueryJoin) => void;
  merge: () => void;
  joined: (q: Query, join: QueryJoin) => void;
  partOut: (q: Query, part: string) => void;
}

/** What the list draws: the queries, the one the rows show, those chosen to merge and how they would be joined. */
interface ListView {
  qs: readonly Query[];
  current: Target | null;
  chosen: ReadonlySet<string>;
  join: QueryJoin;
}

/** A list to pick all of them or any of them, in `row`, named `name`. */
function joinPick(row: HTMLElement, name: string, join: QueryJoin, change: (join: QueryJoin) => void): void {
  const pick = row.createEl('select', { attr: { name, 'aria-label': word('filter.query.merge-as') } });
  pick.createEl('option', { text: word('filter.query.join-all'), attr: { value: 'all' } });
  pick.createEl('option', { text: word('filter.query.join-any'), attr: { value: 'any' } });
  pick.value = join;
  pick.addEventListener('change', () => change(pick.value === 'any' ? 'any' : 'all'));
}

/** The queries of `v` in `list`, each a query item, and below them a bar to merge the chosen, for two or more. */
function queryList(list: HTMLElement, v: ListView, acts: QueryActs): void {
  list.empty();
  for (const q of v.qs) queryItem(list, q, v, acts);
  if (v.qs.length < 2) return;
  // a line of the list of its own, as a list holds only its lines
  const bar = list.createDiv({ cls: 'thoughtknot-query-merge', attr: { role: 'listitem' } });
  joinPick(bar, 'query-merge-join', v.join, acts.joinAs);
  const merge = button(bar, word('filter.query.merge'), 'layers', acts.merge, word('filter.query.merge'));
  merge.disabled = v.chosen.size < 2;
}

/**
 * The query `q` in `list`. It holds its words, to change and ask again, beside the filter they became. It says when
 * the words no longer match, and shows a lock mark while locked. Then come a box to choose it to merge and how it
 * is shown. A merged one says how its parts are joined. Last come the lock, Step back, and a button to work on it. A merged query lists
 * its parts below.
 */
function queryItem(list: HTMLElement, q: Query, v: ListView, acts: QueryActs): void {
  const item = list.createDiv({ cls: 'thoughtknot-query', attr: { role: 'listitem', 'data-query': q.id } });
  if (q.id === v.current?.id) item.addClass('is-current');
  if (v.qs.length > 1) {
    const box = item.createEl('label', { cls: 'thoughtknot-query-choose' });
    const named = word('filter.query.choose-one', { said: querySaid(q) });
    const choose = box.createEl('input', { attr: { name: 'query-choose', type: 'checkbox', 'aria-label': named } });
    box.createSpan({ text: word('filter.query.choose') });
    choose.checked = v.chosen.has(q.id);
    choose.addEventListener('change', () => acts.choose(q, choose.checked));
  }
  const words = item.createEl('input', {
    attr: { name: 'query-words', type: 'text', 'aria-label': word('filter.query.words') },
  });
  words.value = q.words;
  words.disabled = q.locked;
  words.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const said = words.value.trim();
    if (said) acts.ask({ id: q.id }, said);
  });
  const rule = [
    q.locked ? word('filter.query.lock-mark') : '',
    word('filter.query.became', { rule: q.parts ? filterWords(q) : filterSaid(q.draft) }),
    q.matches ? '' : word('filter.query.unmatched'),
  ];
  item.createDiv({ cls: 'thoughtknot-query-rule', text: rule.filter(Boolean).join(' ') });
  const row = item.createDiv({ cls: 'thoughtknot-query-acts' });
  const as = row.createEl('select', { attr: { name: 'query-show', 'aria-label': word('filter.query.show-as') } });
  as.createEl('option', { text: word('filter.query.as-filter'), attr: { value: 'filter' } });
  as.createEl('option', { text: word('filter.query.as-highlight'), attr: { value: 'highlight' } });
  as.value = q.show;
  as.addEventListener('change', () => acts.shown(q, as.value === 'highlight' ? 'highlight' : 'filter'));
  if (q.parts) joinPick(row, 'query-join', q.join ?? 'all', (join) => acts.joined(q, join));
  const lockLabel = word(q.locked ? 'filter.query.unlock' : 'filter.query.lock');
  const lock = button(row, lockLabel, 'lock', () => acts.lock(q)); // pressed while locked, as a board layer's
  lock.setAttribute('aria-pressed', String(q.locked));
  const back = button(row, word('filter.query.back'), 'undo-2', () => acts.back(q));
  back.disabled = q.locked || !q.back.length;
  const pick = button(row, word('filter.query.pick'), 'pencil', () => acts.pick({ id: q.id }));
  if (q.id === v.current?.id && !v.current.part) pick.setAttribute('aria-current', 'true');
  if (q.parts) partsOf(item, q, v, acts);
}

/** The parts of the merged `q` in `item`: each with its own mark, a button to work on it, and one to take it out. */
function partsOf(item: HTMLElement, q: Query, v: ListView, acts: QueryActs): void {
  const parts = item.createDiv({
    cls: 'thoughtknot-query-parts',
    attr: { role: 'list', 'aria-label': word('filter.query.parts') },
  });
  for (const p of q.parts ?? []) {
    const row = parts.createDiv({ cls: 'thoughtknot-query-part', attr: { role: 'listitem', 'data-part': p.id } });
    legendBadge(row, p.mark);
    row.createSpan({ cls: 'thoughtknot-query-part-said', text: querySaid(p) });
    const said = { said: querySaid(p) };
    const pick = button(row, word('filter.query.part-pick', said), 'pencil', () => acts.pick({ id: q.id, part: p.id }));
    if (v.current?.id === q.id && v.current.part === p.id) pick.setAttribute('aria-current', 'true');
    const out = button(row, word('filter.query.part-out', said), 'x', () => acts.partOut(q, p.id));
    out.disabled = q.locked;
  }
}
