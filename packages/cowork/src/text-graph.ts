// Text to graph in the skill (editor spec §47, text_to_graph_skill). The conversation's own model makes the graph. The
// library gives it the instructions and the message, the same the editor sends (text_to_graph_one_contract). The
// library also reads its answer, so an answer the editor would refuse is refused here too. Nothing is written until the
// person approves that graph for that note as it is now (cowork_same_bytes, answers_are_proposals).
import {
  gqlBlocks,
  graphOfBlock,
  noteWithTextGraphApplied,
  readNote,
  textGraphMessage,
  textGraphProposal,
  word,
} from '@thoughtknot/core';
import { approvalFor } from './cowork.ts';
import type { Applied } from './cowork.ts';

/** The graph the text goes into: the one named, else the note's first, else `notes`. */
export const graphForText = (note: string, graph?: string): string =>
  graph ?? [...readNote(gqlBlocks(note).map((b) => b.text)).graphs.keys()][0] ?? 'notes';

/** What the model is to be given: the library's instructions and message, and the graph; or why there is none. */
export function textGraphAsk(
  note: string,
  text: string,
  graph?: string,
): { graph: string; instructions: string; message: string } | { refused: string } {
  const g = graphForText(note, graph);
  const made = textGraphMessage(note, g, text);
  return 'refused' in made ? made : { graph: g, ...made };
}

/** A text graph proposed: each change, the things matched, the graph's block as it would be, and its approval. */
export type TextGraphProposed =
  | { refused: string }
  | { asks: string }
  | {
      said: string;
      changes: { gql: string; reason: string }[];
      matched: { name: string; thing: string; by: string }[];
      now: string;
      after: string;
      approve: string;
    };

/** What the model's answer would write into the note (nothing is written). */
export function textGraphPropose(note: string, text: string, answer: string, graph?: string): TextGraphProposed {
  const g = graphForText(note, graph);
  const read = textGraphProposal(note, g, text, answer, 'conversation');
  if ('asks' in read) return read;
  if ('unread' in read) return { refused: word('cowork.proposal.refused', { why: read.unread }) };
  const after = noteWithTextGraphApplied(note, read.proposal);
  if (typeof after !== 'string') return { refused: word('cowork.proposal.refused', { why: after.refused }) };
  const now = gqlBlocks(after)
    .filter((b) => graphOfBlock(b.text) === g)
    .at(-1)?.text;
  return {
    said: word('cowork.text-graph.proposal', { count: read.proposal.changes.length, graph: g }),
    changes: read.proposal.changes.map((c) => ({ gql: c.op === 'add' ? c.gql : c.id, reason: c.reason ?? '' })),
    matched: read.matched.map(({ name, thing, by }) => ({ name, thing, by })),
    now: now ?? '',
    after,
    approve: approvalFor(note, after),
  };
}

/** The note to write for a text graph, only when `approved` is the digest of this very graph for this very note. */
export function textGraphApply(note: string, text: string, answer: string, approved: string, graph?: string): Applied {
  const made = textGraphPropose(note, text, answer, graph);
  if ('refused' in made) return made;
  if ('asks' in made) return { refused: made.asks };
  if (made.approve !== approved) return { refused: word('cowork.apply.not-approved') };
  return { write: made.after, said: word('cowork.apply.written') };
}
