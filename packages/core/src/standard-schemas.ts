// The standard schemas (spec §27, standard_schemas). These are shared schemas the library ships, each named with its
// version. So a graph can name one, `// graph: reader · schema decision@1`, and its note needs no schema of its own. A
// vault's own schema of the same name and version is used in its place; the standard one is never copied into a note.
import { firstLine } from './blocks.ts';
import { N, S } from './whitespace.ts';

const SHARED_NAME = new RegExp(`·${S}*SCHEMA${S}+(${N}+)`);

/** Each standard schema, as a shared schema block: its graph line names it with its version. */
export const STANDARD_SCHEMAS: readonly string[] = [
  `// graph: decision · SCHEMA decision@1
// The standard schema for a decision: a question, the options that answer it, and the reasons for and against each.
(decision_schema:GraphMeta {graph: 'decision', schema: 'decision@1'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_reason:Meta:ElementType {name: 'Reason', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source',
    reading: 'answers', reverse_name: 'is answered by'}),
(link_favours:Meta:ElementType {name: 'FAVOURS', kind: 'edge', origin: 'source',
    reading: 'favours', reverse_name: 'is favoured by'}),
(link_counts_against:Meta:ElementType {name: 'COUNTS_AGAINST', kind: 'edge', origin: 'source',
    reading: 'counts against', reverse_name: 'is counted against by'}),
(decision_schema)-[:DECLARES]->(kind_question),
(decision_schema)-[:DECLARES]->(kind_option),
(decision_schema)-[:DECLARES]->(kind_reason),
(decision_schema)-[:DECLARES]->(link_answers),
(decision_schema)-[:DECLARES]->(link_favours),
(decision_schema)-[:DECLARES]->(link_counts_against)`,
  `// graph: intent · SCHEMA intent@1
// The standard schema for an intent: what a person is trying to reach, and the things that support or contradict it.
(intent_schema:GraphMeta {graph: 'intent', schema: 'intent@1'}),
(kind_intent:Meta:ElementType {name: 'Intent', kind: 'node', origin: 'source'}),
(kind_intent_rule:Meta:ElementType {name: 'IntentRule', kind: 'node', origin: 'source'}),
(kind_thing:Meta:ElementType {name: 'Thing', kind: 'node', origin: 'source'}),
(link_supports:Meta:ElementType {name: 'SUPPORTS', kind: 'edge', origin: 'source',
    reading: 'supports', reverse_name: 'is supported by'}),
(link_contradicts:Meta:ElementType {name: 'CONTRADICTS', kind: 'edge', origin: 'source',
    reading: 'contradicts', reverse_name: 'is contradicted by'}),
(link_checks:Meta:ElementType {name: 'CHECKS', kind: 'edge', origin: 'source',
    reading: 'checks', reverse_name: 'is checked by'}),
(intent_schema)-[:DECLARES]->(kind_intent),
(intent_schema)-[:DECLARES]->(kind_intent_rule),
(intent_schema)-[:DECLARES]->(kind_thing),
(intent_schema)-[:DECLARES]->(link_supports),
(intent_schema)-[:DECLARES]->(link_contradicts),
(intent_schema)-[:DECLARES]->(link_checks)`,
];

/** The name a shared schema block gives itself, with its version: `decision@1`; null for any other block. */
export const sharedSchemaName = (block: string): string | null => SHARED_NAME.exec(firstLine(block))?.[1] ?? null;

/** A vault's shared schema blocks with the standard ones after them, each standard one only when the vault has none of its name. */
export function withStandardSchemas(vault: readonly string[]): string[] {
  const own = new Set(vault.map(sharedSchemaName));
  return [...vault, ...STANDARD_SCHEMAS.filter((s) => !own.has(sharedSchemaName(s)))];
}
