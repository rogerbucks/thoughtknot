// A saved query opened again, or asked again (editor spec ES§75, ai_query_replay). Opening it runs the rule it ended at
// on the graph as it is now, with nothing sent. It is marked when that rule no longer fits the note (ai_query_stale).
// Ask again sends its prompts again, in order, against today's graph. That happens only after the person says yes to
// what will be sent, and each send keeps every rule of ES§19. Its answers are kept on this device (ai_query_cache).
//
// Host-free: the host gives the yes and the send.
import type { Graph } from '@thoughtknot/graph-spec';
import type { SendAsk, SendResult } from './ai.ts';
import { blankFilter } from './filter-ask.ts';
import { FIRST_MARK, queryOf } from './filter.ts';
import type { Query, QueryMark } from './filter.ts';
import { queryCacheKey } from './filter-cache.ts';
import type { QueryAnswer, QueryCache } from './filter-cache.ts';
import type { SavedQuery } from './filter-manage.ts';
import { queryAsk, queryResult } from './filter-send.ts';
import { queryStale } from './filter-stale.ts';
import type { RuleChoices, RuleDraft } from './rule-builder.ts';
import { word } from './words.ts';

/** A saved query opened: the query, and why it no longer fits the note if so. Or why it cannot be opened. */
export type QueryOpened = { query: Query; stale: string | null } | { broken: string };

/** A query from saved prompts: the last as its words, the ones before kept in order. */
const fromPrompts = (id: string, words: readonly string[], draft: RuleDraft, mark: QueryMark): Query => ({
  ...queryOf(id, words.at(-1) ?? '', draft, mark),
  asked: words.slice(0, -1),
});

/** The saved query `s` opened as `id`, to run on the graph as it is now. Nothing is sent. */
export function savedQueryOpened(s: SavedQuery, id: string, choices: RuleChoices): QueryOpened {
  if (s.broken || (!s.draft && !s.parts))
    return { broken: s.broken ?? word('filter.saved-query.none', { name: s.name }) };
  const look = { show: s.show, locked: s.locked };
  const parts = s.parts?.map((p, i) => fromPrompts(`${id}-${i + 1}`, p.words, p.draft, p.mark));
  const query = parts
    ? { ...fromPrompts(id, s.words, blankFilter(), FIRST_MARK), ...look, parts, join: s.join ?? 'all' }
    : { ...fromPrompts(id, s.words, s.draft ?? blankFilter(), FIRST_MARK), ...look };
  return { query, stale: queryStale(query, choices) };
}

/** The prompts Ask again sends for `s`, in order: its own, or each part's in turn. */
export function askAgainPrompts(s: SavedQuery): string[] {
  return s.parts ? s.parts.flatMap((p) => p.words) : s.words;
}

/** What the person is shown before Ask again sends anything: each prompt, numbered in order. */
export function askAgainSaid(s: SavedQuery): string {
  const prompts = askAgainPrompts(s);
  const listed = prompts.map((p, i) => `${i + 1}. ${p}`).join('; ');
  return word('filter.replay.confirm', { count: prompts.length, prompts: listed });
}

/** One prompt asked: of the query as it stands, or of none for the first. The host shows it and sends it. */
export type QueryAsker = (q: Query | null, prompt: string) => Promise<QueryAnswer>;

/** A `QueryAsker` that sends through `send` the ask for each prompt, held to every rule of a send (filter-send.ts). */
export function askerOf(
  base: Omit<SendAsk, 'question' | 'answers' | 'choice'>,
  graph: string,
  choices: RuleChoices,
  send: (ask: SendAsk) => Promise<SendResult>,
): QueryAsker {
  return async (q, prompt) => {
    const ask = queryAsk(base, graph, choices, q, prompt);
    return 'refused' in ask ? ask : send(ask);
  };
}

/** What Ask again needs of the host: the graph as it is now, the person's yes, the ask, and the cache. */
export interface AskAgainDeps {
  now: Graph;
  choices: RuleChoices;
  confirm: (said: string) => boolean | Promise<boolean>;
  ask: QueryAsker;
  cache?: QueryCache;
}

/** What came of Ask again: the query made afresh, why it stopped, or that nothing was sent. */
export type AskedAgain = { query: Query } | { failed: string } | { declined: string };

/**
 * `s` asked again as `id`: each prompt sent in order, each part's in turn, against the graph as it is now. Only after
 * the person says yes to `askAgainSaid`. A no sends nothing. Refused while locked or broken. Each answer is kept.
 */
export async function askedAgain(s: SavedQuery, id: string, deps: AskAgainDeps): Promise<AskedAgain> {
  if (s.broken) return { failed: word('filter.replay.broken', { why: s.broken }) };
  if (s.locked) return { failed: word('filter.replay.locked') };
  if (!askAgainPrompts(s).length) return { failed: word('ai.rule.no-words') };
  if (!(await deps.confirm(askAgainSaid(s)))) return { declined: word('filter.replay.declined') };
  const chains = s.parts?.map((p, i) => ({ id: `${id}-${i + 1}`, words: p.words, mark: p.mark })) ?? [
    { id, words: s.words, mark: FIRST_MARK },
  ];
  const made: Query[] = [];
  let n = 0;
  for (const chain of chains) {
    let q: Query | null = null;
    for (const prompt of chain.words) {
      n++;
      const result = await deps.ask(q, prompt);
      if ('rule' in result) deps.cache?.keep(queryCacheKey(prompt, q, deps.choices), result.rule);
      const asked = queryResult(q, prompt, result, deps.now, deps.choices, chain.id);
      if ('failed' in asked) return { failed: word('filter.replay.failed', { n, why: asked.failed }) };
      q = asked.query;
    }
    if (q) made.push({ ...q, mark: chain.mark });
  }
  const [only] = made;
  if (!s.parts && only) return { query: { ...only, show: s.show } };
  return { query: { ...queryOf(id, '', blankFilter()), show: s.show, parts: made, join: s.join ?? 'all' } };
}
