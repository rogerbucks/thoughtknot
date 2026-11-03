// Asking in plain words (editor spec §60, discover_ask_plain). A person asks for what to show. An AI turns the words
// into a query. The query is checked as untrusted (ai_queries_untrusted), so a write, an unknown field or a name that
// is not one word is refused. A query that passes is shown with how many things it finds before it runs. Running it
// only reads.
import type { Graph } from '@thoughtknot/graph-spec';
import { checkQuery, matchIds } from './ai-query.ts';
import type { AiQuery, QueryFault } from './ai-query.ts';

/** A query waiting for a person to run it: the query, and how many things it finds. */
export interface AskPreview {
  query: AiQuery;
  count: number;
}

/** The AI's side: words in, a query out. It may return anything, so what it returns is not trusted. */
export type Translate = (question: string) => unknown;

/** The query for a question, checked, with its count; or the fault that refused it. Nothing runs yet. */
export function askPlain(
  question: string,
  translate: Translate,
  g: Pick<Graph, 'nodes' | 'edges'>,
): { ok: true; preview: AskPreview } | { ok: false; fault: QueryFault } {
  const checked = checkQuery(translate(question));
  if (!checked.ok) return checked;
  return { ok: true, preview: { query: checked.query, count: matchIds(g, checked.query).length } };
}

/** The things a previewed query finds, up to its limit. Only reads. */
export function runAsk(preview: AskPreview, g: Pick<Graph, 'nodes' | 'edges'>): string[] {
  return matchIds(g, preview.query).slice(0, preview.query.limit);
}
