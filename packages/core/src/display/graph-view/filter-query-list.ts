// The queries asked in words, listed in the Filter panel under the ask box (editor spec ES§75). Each shows its words
// beside the filter they became, and the words can be changed to ask again (ai_query_words_kept). A hand edit of the
// rows marks them as no longer matching. Each query is shown as a filter or a highlight (ai_query_highlight), can be
// locked (ai_query_lock) and stepped back. A send that fails says why, keeps the words and leaves the drawing as it was
// (ai_query_fails_open). Two or more can be chosen and merged, all of them or any (ai_query_merge). The merged query
// holds a copy of each part, so changing another query never changes it. Each part has its own mark, can be worked on
// in the rows, and taken out again. The query and its rules are filter.ts and filter-send.ts: the AI only turns words
// into a filter. Merging runs here, with nothing sent. The panel round it is untangle-ask.ts; the list is drawn by
// untangle-query-items.ts.
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { RuleChoices, RuleDraft, RuleWrite } from '@thoughtknot/core';
import { blankFilter, filterReady } from '../../filter-ask.ts';
import { queryAskWords, queryBack, queryEdited, queryJoined, queryLocked } from '../../filter.ts';
import { queryPart, queryPartOut, querySaid, queryShown, queriesMerged } from '../../filter.ts';
import type { Query, QueryJoin, QueryRefused } from '../../filter.ts';
import { queryCacheKey } from '../../filter-cache.ts';
import type { QueryAnswer } from '../../filter-cache.ts';
import type { SavedQueries } from '../../filter-manage.ts';
import type { QueryAsker } from '../../filter-replay.ts';
import { queryResult } from '../../filter-send.ts';
import type { FormState } from './rule-form-parts.ts';
import { queryList } from './untangle-query-items.ts';
import type { Target } from './untangle-query-items.ts';

/** Whether every filter of `q` is ready: its own, or each of its parts'. */
const ready = (q: Query): boolean => (q.parts ? q.parts.every(ready) : filterReady(q.draft));

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
  /** Answers kept on this device: a key kept is answered with nothing sent (ai_query_cache). */
  answers?: SavedQueries['answers'];
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

  /** A fresh id for a query opened from a save or asked again. */
  fresh(): string {
    return `query-${++this.made}`;
  }

  /** `q`, opened from a save or asked again, put in the list, worked on and shown as it says. Nothing is sent. */
  adopt(q: Query): void {
    this.put(q);
    this.work({ id: q.id });
    this.showQuery(q);
  }

  /** The query worked on, a merged one whole, to save by name; none when no query is worked on. */
  held(): Query | null {
    return this.top();
  }

  /** Each prompt asked the way the ask box asks: shown by the host and sent, or why not. */
  asker(): QueryAsker {
    return (q, prompt) =>
      new Promise<QueryAnswer>((done) => {
        const sent = queryAskWords(q, prompt);
        if (typeof sent !== 'string') return done(sent);
        if (!this.host.describe) return done({ refused: word('filter.replay.no-send') });
        this.host.describe(
          sent,
          (rule) => done({ rule }),
          (why) => done({ refused: why }),
        );
      });
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
    // the same words of the same rule, for a note of the same kinds and properties, are answered as before
    const key = queryCacheKey(words, this.at(t), this.host.choices);
    const kept = this.host.answers?.answer(key);
    if (kept) return this.settle(t, words, { rule: kept }, word('filter.cache.reused'));
    this.host.tell(word('filter.ask.asking'));
    // the host hands back only the rule, or why there is none; queryResult needs no more of the send
    this.host.describe?.(
      sent,
      (rule) => {
        this.host.answers?.keep(key, rule);
        this.settle(t, words, { rule });
      },
      (why) => this.settle(t, words, { refused: why }),
    );
  }

  /** What came of asking: the query filled, or why not, with the words kept and the drawing as it was. */
  private settle(t: Target | null, words: string, result: QueryAnswer, said = word('filter.ask.filled')): void {
    const { graph, choices } = this.host;
    const asked = queryResult(this.at(t), words, result, graph, choices, `query-${++this.made}`);
    if ('failed' in asked) return this.host.tell(asked.failed);
    const placed = this.place(t ?? { id: asked.query.id }, asked.query);
    if ('refused' in placed) return this.host.tell(placed.refused);
    this.work(t ?? { id: asked.query.id });
    this.host.byAi(true);
    this.host.tell(said);
  }
}
