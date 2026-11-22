// Ask the graph: filters and highlights from plain words (editor spec ES§75). Roger, 22 Nov 2026: a question asked in
// words becomes a filter or a highlight that can be refined, locked and merged. A query holds:
// - the words asked, beside the filter they became (ai_query_words_kept). New words go with the filter as it stands; a
//   hand edit marks the words as no longer matching; every change can be stepped back.
// - how it is shown (ai_query_highlight): a filter fades or hides what it does not keep; a highlight hides nothing and
//   marks what it finds with a badge and a colour. Neither moves a thing or writes to the note.
// - a lock (ai_query_lock): while locked, nothing changes its words or filter. It goes on applying as the graph changes.
// - parts, when merged (ai_query_merge): all of them or any of them, each part with its own mark, named in a legend.
// Every send goes the one way anything is sent (ai.ts, through rule-describe.ts), so the AI rules of ES§19 hold
// (ai_query_sends_ruled). A query that fails leaves what was shown, says why and keeps the words (ai_query_fails_open).
//
// Host-free and pure: each change gives a new query, or why it is refused.
import type { Graph } from '@thoughtknot/graph-spec';
import type { SendAsk, SendRefused, SendResult } from './ai.ts';
import { blankFilter, filterKeeps, filterOfRule, filterReady, filterSaid, withAsked } from './filter-ask.ts';
import type { FocusEdge, Kept } from './focus.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { RuleChoices, RuleDraft } from './rule-builder.ts';
import { ruleDescribeAsk } from './rule-describe.ts';
import type { Badge } from './rule-words.ts';
import type { RuleWrite } from './rule-write.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** How a query is shown: as a filter, or as a highlight. */
export type QueryShow = 'filter' | 'highlight';
/** How merged parts are joined: a thing shows when it matches all of them, or any of them. */
export type QueryJoin = 'all' | 'any';

/** How a highlight marks what it finds: a badge, so never by colour alone, and a colour. */
export interface QueryMark {
  badge: Badge;
  colour: string;
}

/** What a step back restores: the words, the filter, whether they match, and the parts of a merge. */
export interface QueryStep {
  words: string;
  draft: RuleDraft;
  matches: boolean;
  parts?: readonly Query[];
  join?: QueryJoin;
}

/** A query asked in words, as it stands. */
export interface Query extends QueryStep {
  id: string;
  show: QueryShow;
  /** For a filter: the rest is hidden rather than faded. */
  hide: boolean;
  locked: boolean;
  mark: QueryMark;
  /** The changes before this one, the latest last. */
  back: readonly QueryStep[];
}

/** A change refused, and why in words. */
export interface QueryRefused {
  refused: string;
}

/** The marks given in turn, each with its own badge, so merged highlights are told apart. */
export const QUERY_MARKS: readonly QueryMark[] = Object.freeze([
  { badge: 'flag', colour: 'blue' },
  { badge: 'star', colour: 'orange' },
  { badge: 'check', colour: 'green' },
  { badge: 'dot', colour: 'purple' },
  { badge: 'warning', colour: 'yellow' },
  { badge: 'question', colour: 'cyan' },
  { badge: 'up', colour: 'pink' },
  { badge: 'down', colour: 'red' },
]);

const FIRST_MARK: QueryMark = { badge: 'flag', colour: 'blue' };
const refused = (key: WordKey): QueryRefused => ({ refused: word(key) });
const stepOf = (q: Query): QueryStep => ({
  words: q.words,
  draft: q.draft,
  matches: q.matches,
  ...(q.parts ? { parts: q.parts, join: q.join } : {}),
});
/** `q` changed to `step`, the step it was kept to step back to. */
const changed = (q: Query, step: QueryStep): Query => {
  const { parts: _p, join: _j, ...rest } = q;
  return { ...rest, ...step, back: [...q.back, stepOf(q)] };
};

/** A new query: the words asked and the filter they became, shown as a filter. */
export function queryOf(id: string, words: string, draft: RuleDraft, mark: QueryMark = FIRST_MARK): Query {
  return { id, words, draft, matches: true, show: 'filter', hide: false, locked: false, mark, back: [] };
}

/** `q` shown as a filter or a highlight, and for a filter whether the rest hides. Allowed at any time, locked too. */
export function queryShown(q: Query, show: QueryShow, hide = q.hide): Query {
  return { ...q, show, hide };
}

/** `q` locked or unlocked. */
export function queryLocked(q: Query, locked: boolean): Query {
  return { ...q, locked };
}

/** The filter of `q` in plain words: its own, or its parts' joined by and or or. */
function filterWords(q: Query): string {
  if (!q.parts) return filterSaid(q.draft);
  const join = word(q.join === 'any' ? 'filter.query.any' : 'filter.query.all');
  return q.parts.map((p) => `(${filterWords(p)})`).join(` ${join} `);
}

/** What `q` is called: its words, or its filter in words; a lock mark while locked; a note if the words no longer match. */
export function querySaid(q: Query): string {
  const join = word(q.join === 'any' ? 'filter.query.any' : 'filter.query.all');
  const said = q.parts ? q.parts.map((p) => p.words || filterWords(p)).join(` ${join} `) : q.words || filterWords(q);
  const parts = [q.locked ? word('filter.query.lock-mark') : '', said, q.matches ? '' : word('filter.query.unmatched')];
  return parts.filter(Boolean).join(' ');
}

/** The words sent for `words`: alone for a new query, or with its filter as it stands. Refused while locked. */
export function queryAskWords(q: Query | null, words: string): string | QueryRefused {
  if (!q) return words;
  if (q.locked) return refused('filter.query.locked');
  const ready = q.parts || filterReady(q.draft);
  return ready ? word('filter.ask.change', { now: filterWords(q), words }) : words;
}

/**
 * The ask for a query from words, ready for `prepareSend`: a first ask, a refinement, or a merged query asked again.
 * It is a rule described (rule-describe.ts), so it is held to every rule of a send. Refused while locked.
 */
export function queryAsk(
  base: Omit<SendAsk, 'question' | 'answers' | 'choice'>,
  graph: string,
  choices: RuleChoices,
  q: Query | null,
  words: string,
): SendAsk | SendRefused {
  const sent = queryAskWords(q, words);
  if (typeof sent !== 'string') return sent;
  return ruleDescribeAsk(base, graph, choices, sent);
}

/**
 * `q` filled from the rule an AI answered for `words`, matching them; or a new query `id` with none. A merged query
 * asked again becomes the one filter answered, its parts kept to step back to. Refused while locked, or for an answer
 * that is no filter on things.
 */
export function queryAnswered(q: Query | null, words: string, rule: RuleWrite, id = 'query'): Query | QueryRefused {
  if (q?.locked) return refused('filter.query.locked');
  const draft = filterOfRule(rule);
  if (!draft) return refused('filter.ask.not-filter');
  return q ? changed(q, { words, draft, matches: true }) : queryOf(id, words, draft);
}

/** `q` with its filter changed by hand: the words stay, marked as no longer matching. Refused while locked. */
export function queryEdited(q: Query, draft: RuleDraft): Query | QueryRefused {
  if (q.locked) return refused('filter.query.locked');
  return changed(q, { words: q.words, draft, matches: false, ...(q.parts ? { parts: q.parts, join: q.join } : {}) });
}

/** `q` stepped back to the change before. Refused while locked, or with nothing before. */
export function queryBack(q: Query): Query | QueryRefused {
  if (q.locked) return refused('filter.query.locked');
  const before = q.back.at(-1);
  if (!before) return refused('filter.query.no-back');
  const { parts: _p, join: _j, ...rest } = q;
  return { ...rest, ...before, back: q.back.slice(0, -1) };
}

/** The keys of the things of `graph` that `q` keeps, worked out afresh, so a query goes on applying as the graph changes. */
export function queryKeeps(graph: Graph, q: Query, choices?: RuleChoices): Set<string> {
  if (!q.parts) return new Set(filterKeeps(graph, q.draft, choices));
  const each = q.parts.map((p) => queryKeeps(graph, p, choices));
  if (q.join === 'any') return new Set(each.flatMap((s) => [...s]));
  const [first = new Set<string>(), ...rest] = each;
  return new Set([...first].filter((k) => rest.every((s) => s.has(k))));
}

/**
 * The queries `qs` merged as `id`, joined by `join`. Each part keeps its own mark where it can; a mark already taken is
 * given the next one free, so each highlight has its own. Refused for fewer than two.
 */
export function queriesMerged(id: string, qs: readonly Query[], join: QueryJoin): Query | QueryRefused {
  if (qs.length < 2) return refused('filter.query.merge-few');
  const taken = new Set<string>();
  const parts = qs.map((p) => {
    const free = QUERY_MARKS.find((m) => !taken.has(m.badge)) ?? p.mark;
    const mark = taken.has(p.mark.badge) ? free : p.mark;
    taken.add(mark.badge);
    return { ...p, mark };
  });
  return { ...queryOf(id, '', blankFilter()), parts, join };
}

/** The merged `q` joined the other way. Refused while locked, or for a query not merged. */
export function queryJoined(q: Query, join: QueryJoin): Query | QueryRefused {
  if (q.locked) return refused('filter.query.locked');
  if (!q.parts) return refused('filter.query.not-merged');
  return changed(q, { ...stepOf(q), join });
}

/** The merged `q` with its part `id` changed by `change`, in place. Refused while locked, or for a part it lacks. */
export function queryPart(q: Query, id: string, change: (p: Query) => Query | QueryRefused): Query | QueryRefused {
  if (q.locked) return refused('filter.query.locked');
  const at = q.parts?.findIndex((p) => p.id === id) ?? -1;
  if (!q.parts || at < 0) return refused('filter.query.no-part');
  const part = q.parts[at];
  if (!part) return refused('filter.query.no-part');
  const done = change(part);
  if ('refused' in done) return done;
  return changed(q, { ...stepOf(q), parts: q.parts.map((p, i) => (i === at ? done : p)) });
}

/** The merged `q` with its part `id` taken out; with one part left, that part on its own. Refused while locked. */
export function queryPartOut(q: Query, id: string): Query | QueryRefused {
  if (q.locked) return refused('filter.query.locked');
  if (!q.parts?.some((p) => p.id === id)) return refused('filter.query.no-part');
  const parts = q.parts.filter((p) => p.id !== id);
  const [only] = parts;
  return parts.length === 1 && only ? only : changed(q, { ...stepOf(q), parts });
}

/** The legend of a highlight: each part, or the query itself, with its mark and what it is called. None for a filter. */
export function queryLegend(q: Query): { id: string; mark: QueryMark; said: string }[] {
  if (q.show !== 'highlight') return [];
  return (q.parts ?? [q]).map((p) => ({ id: p.id, mark: p.mark, said: querySaid(p) }));
}

/**
 * What a drawing shows with `q` over the legend's choice. Shown as a filter, what it keeps comes forward and the rest
 * fades, or hides if asked (filter-ask.ts, `withAsked`). Shown as a highlight, nothing fades or hides: each thing it
 * keeps gets the mark of each part that finds it. It says only what is shown, never a place, so nothing moves.
 */
export function queryView(
  d: Pick<GraphDrawing, 'boxes'>,
  edges: readonly FocusEdge[],
  legend: { forward: Kept | null; hidden: Kept },
  q: Query,
  graph: Graph,
  choices?: RuleChoices,
): { forward: Kept | null; hidden: Kept; marks: Map<string, QueryMark[]> } {
  const things = queryKeeps(graph, q, choices);
  const marks = new Map<string, QueryMark[]>();
  if (q.show === 'filter') return { ...withAsked(d, edges, legend, { things, hide: q.hide }), marks };
  const parts = q.parts
    ? q.parts.map((p) => ({ mark: p.mark, keeps: queryKeeps(graph, p, choices) }))
    : [{ mark: q.mark, keeps: things }];
  for (const b of d.boxes)
    if (things.has(b.key) && !legend.hidden.things.has(b.key))
      marks.set(
        b.key,
        parts.filter((p) => p.keeps.has(b.key)).map((p) => p.mark),
      );
  return { forward: legend.forward, hidden: legend.hidden, marks };
}

/** What came of asking: the query filled, or why not, with what was shown before and the words kept to try again. */
export type QueryAsked = { query: Query } | { failed: string; query: Query | null; words: string };

/**
 * What a send for `q` and `words` comes to (ai_query_fails_open). An answer is only taken as a filter on things that
 * keeps something in `graph`. Anything else, a send refused or failed, a question back, an answer that is no filter or
 * keeps nothing, says why in words and leaves `q` as it was, so the graph is shown as before and the words are kept.
 */
export function queryResult(
  q: Query | null,
  words: string,
  result: SendResult,
  graph: Graph,
  choices?: RuleChoices,
  id?: string,
): QueryAsked {
  const fail = (why: string): QueryAsked => ({ failed: word('filter.query.failed', { why }), query: q, words });
  if ('refused' in result) return fail(result.refused);
  if ('failed' in result) return fail(result.failed);
  if ('asks' in result) return fail(word('filter.query.asks', { asks: result.asks }));
  if (!('rule' in result)) return fail(word('filter.ask.not-filter'));
  const filled = queryAnswered(q, words, result.rule, id);
  if ('refused' in filled) return fail(filled.refused);
  if (!queryKeeps(graph, filled, choices).size) return fail(word('filter.query.keeps-none'));
  return { query: filled };
}
