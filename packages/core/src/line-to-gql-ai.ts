// Loose lines to GQL with AI (editor spec §47, line_to_gql_ai). When code cannot convert a loose line, the person may
// send it to an AI. It goes through the one text to graph contract (text_to_graph_one_contract): the line is the text.
// The graph without the loose line goes with it, so the names already there are reused (text_to_graph_merge).
// - The send keeps the rules of §19, as text to graph does: off until chosen, within the ceiling, seen, recorded.
// - The answer is read as text to graph reads it. Its new things and links are then put on the line and read there
//   by the library (line_to_gql_checked). Nothing is written until the person accepts.
import type { SendAsk, SendRefused } from './ai.ts';
import { aiReady } from './ai-choice.ts';
import { convertLine, lineWithGql, looseLine, noteWithoutLine } from './line-to-gql.ts';
import type { LineConverted } from './line-to-gql.ts';
import type { Proposal } from './proposals.ts';
import { textToGraphAsk } from './text-to-graph.ts';
import { word } from './words.ts';

/** What is offered beside a loose line: the GQL code made of it, or a send to an AI; or a reason code refused it. */
export type LineOffer = { by: 'code'; gql: string; graph: string } | { by: 'ai'; graph: string } | { refused: string };

/**
 * The offer for 0-based `line` of the note, or null when there is none. Code is offered when it converts the line. An
 * AI is offered when code finds no shape and `aiOn`. Code's other refusals are offered too, to say why.
 */
export function lineOffer(note: string, line: number, aiOn: boolean): LineOffer | null {
  const loose = looseLine(note, line);
  if (!loose) return null;
  const code = convertLine(note, line);
  if ('gql' in code) return { by: 'code', gql: code.gql, graph: loose.graph };
  if (code.refused !== word('line-gql.no-shape')) return { refused: code.refused };
  return aiOn ? { by: 'ai', graph: loose.graph } : null;
}

/** Whether AI is on and set up, so a line may be offered to it. */
export const aiOnFor = (settings: Parameters<typeof aiReady>[0]): boolean => !('off' in aiReady(settings));

/**
 * The ask to convert the loose line at 0-based `line` of `base.note` with an AI, ready for `prepareSend`; or why
 * there is none. It is text to graph's ask, with the line as its text and the note without the line as its note.
 */
export function lineToGqlAsk(
  base: Omit<SendAsk, 'question' | 'answers' | 'choice'>,
  line: number,
  asked = '',
): SendAsk | SendRefused {
  const loose = looseLine(base.note, line);
  if (!loose) return { refused: word('line-gql.not-loose') };
  const note = noteWithoutLine(base.note, line);
  return textToGraphAsk({ ...base, note }, loose.graph, loose.text, asked.trim() || word('line-gql.question'));
}

/** The AI's proposal for the loose line at 0-based `line`, put on the line and checked there; or why not. */
export function lineFromProposal(note: string, line: number, proposal: Proposal): LineConverted {
  const elements = proposal.changes.flatMap((c) => (c.op === 'add' ? [c.gql] : []));
  return lineWithGql(note, line, elements);
}
