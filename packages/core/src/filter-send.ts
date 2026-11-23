// What is sent for a query asked in words, and what comes back (editor spec ES§75). Every send goes the one way
// anything is sent (ai.ts), as a rule described (rule-describe.ts). So the AI rules of ES§19 hold for it
// (ai_query_sends_ruled). A query that fails leaves what was shown. It says why, and keeps the words
// (ai_query_fails_open). The query itself is filter.ts.
//
// Host-free and pure.
import type { Graph } from '@thoughtknot/graph-spec';
import type { SendAsk, SendRefused } from './ai.ts';
import type { QueryAnswer } from './filter-cache.ts';
import { queryFitless } from './filter-fuzzy.ts';
import { queryAnswered, queryAskWords, queryKeeps } from './filter.ts';
import type { Query } from './filter.ts';
import type { RuleChoices } from './rule-builder.ts';
import { ruleDescribeAsk } from './rule-describe.ts';
import { word } from './words.ts';

/**
 * The ask for a query from words, ready for `prepareSend`: a first ask, a refinement, or a merged query asked again.
 * It is a rule described, so it is held to every rule of a send. Refused while locked.
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
  return ruleDescribeAsk(base, graph, choices, sent, (why) => queryFitless(choices, why));
}

/** What came of asking: the query filled, or why not, with what was shown before and the words kept to try again. */
export type QueryAsked = { query: Query } | { failed: string; query: Query | null; words: string };

/**
 * What a send for `q` and `words` comes to (ai_query_fails_open). An answer is taken only as a filter on things that
 * keeps something in `graph`. Anything else says why in words: a send refused or failed, or a question back. So does
 * an answer that is no filter, or keeps nothing. Each leaves `q` as it was, so the graph is shown as before and the
 * words are kept.
 */
export function queryResult(
  q: Query | null,
  words: string,
  result: QueryAnswer,
  graph: Graph,
  choices?: RuleChoices,
  id?: string,
): QueryAsked {
  const fail = (why: string): QueryAsked => ({ failed: word('filter.query.failed', { why }), query: q, words });
  // an answer that is no filter on things fits no rule, so a wording to try is said (ai_query_fuzzy)
  const unfit = (why: string) => fail(choices ? queryFitless(choices, why) : why);
  const notFilter = word('filter.ask.not-filter');
  if ('refused' in result) return result.refused === notFilter ? unfit(notFilter) : fail(result.refused);
  if ('failed' in result) return fail(result.failed);
  if ('asks' in result) return fail(word('filter.query.asks', { asks: result.asks }));
  if (!('rule' in result)) return unfit(notFilter);
  const filled = queryAnswered(q, words, result.rule, id);
  if ('refused' in filled) return filled.refused === notFilter ? unfit(filled.refused) : fail(filled.refused);
  if (!queryKeeps(graph, filled, choices).size) return fail(word('filter.query.keeps-none'));
  return { query: filled };
}
