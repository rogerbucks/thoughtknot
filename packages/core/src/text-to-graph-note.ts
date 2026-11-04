// Text to graph into a note (editor spec §47). A note that holds the graph gets the proposal as a change set beside it
// (ai-answer.ts), reviewed over the graph. A note with no such graph has nothing to show it over, and a change set
// needs a graph to be made against. So the person ticks what to keep there, and only that is written, into a new block.
// The skill writes a text graph the same way, but only the note its person approved (cowork_same_bytes).
import { askedText } from './ai-request.ts';
import { aiScope } from './ai-scope.ts';
import { gqlBlocks, gqlSpans, graphOfBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { applyChange, namesOf } from './proposals-apply.ts';
import { basisOf } from './proposals-basis.ts';
import { makeProposal } from './proposals.ts';
import type { Proposal } from './proposals.ts';
import { replaceBlock } from './store.ts';
import { knownThings, textGraphIn, textToGraphInstructions } from './text-to-graph.ts';
import type { Matched } from './text-to-graph.ts';
import { word } from './words.ts';

/** The note with an empty block for `graph` at its end, when it has no block of that graph; else as it is. */
export function withGraphHome(note: string, graph: string): string {
  if (gqlSpans(note).some((s) => graphOfBlock(s.text) === graph)) return note;
  const end = !note || note.endsWith('\n\n') ? '' : note.endsWith('\n') ? '\n' : '\n\n';
  return `${note}${end}\`\`\`gql\n// graph: ${graph}\n\`\`\`\n`;
}

/** Whether the note holds `graph`, so a proposal for it is a change set reviewed over it. */
export function holdsGraph(note: string, graph: string): boolean {
  return !!readNote(gqlSpans(note).map((s) => s.text)).world[graph];
}

/**
 * The proposal with only the changes ticked, by id. A link is kept only while both its ends are in the graph or
 * ticked, so nothing is written that joins a thing left out.
 */
export function tickedOnly(proposal: Proposal, ticked: readonly string[], note: string): Proposal {
  const g = readNote(gqlSpans(note).map((s) => s.text)).world[proposal.graph];
  const kept = proposal.changes.filter((c) => ticked.includes(c.id));
  const there = new Set([...(g ? g.nodes.keys() : []), ...kept.flatMap((c) => namesOf(c).writes)]);
  return { ...proposal, changes: kept.filter((c) => namesOf(c).needs.every((n) => there.has(n))) };
}

/**
 * The note with every change of a text graph's proposal written into its graph, or why it cannot be. A new block is
 * made for the graph if the note has none. It is for changes a person approved. Each is written as an accepted change is
 * (proposals-apply.ts).
 */
export function noteWithTextGraphApplied(note: string, proposal: Proposal): string | { refused: string } {
  const home = withGraphHome(note, proposal.graph);
  const spans = gqlSpans(home);
  let texts = spans.map((s) => s.text);
  for (const c of proposal.changes) {
    const made = applyChange(texts, proposal.graph, c);
    if (!made.ok) return { refused: made.reason };
    texts = made.texts;
  }
  let out = home;
  // from the last block back, so a block grown above never moves the line of one still to write
  for (const [i, s] of [...spans.entries()].reverse()) {
    if (texts[i] === s.text) continue;
    const written = replaceBlock(out, { line: s.open, text: s.text }, texts[i] ?? s.text);
    if (!written.ok) return { refused: written.reason };
    out = written.note;
  }
  return out;
}

/**
 * What a host with a model of its own sends it, such as the skill in a conversation. That is the library's
 * instructions, and the message as the editor would send it (text_to_graph_one_contract). Or why there is none.
 */
export function textGraphMessage(
  note: string,
  graph: string,
  text: string,
  shared: string[] = [],
): { instructions: string; message: string } | { refused: string } {
  if (!text.trim()) return { refused: word('ai.text-graph.no-text') };
  const scope = aiScope(note, { graph, what: 'text' }, shared);
  if ('refused' in scope) return scope;
  return { instructions: textToGraphInstructions(), message: askedText(scope, word('ai.text-graph.question'), text) };
}

/**
 * A model's answer to `textGraphMessage`, read by the same reader the editor uses. It gives a proposal by `by`
 * against the note as it is, and the things it matched in the graph. Or why it cannot be read, or the model's one question.
 */
export function textGraphProposal(
  note: string,
  graph: string,
  text: string,
  answer: string,
  by: string,
): { proposal: Proposal; matched: Matched[] } | { unread: string } | { asks: string } {
  const texts = gqlBlocks(note).map((b) => b.text);
  const read = textGraphIn(answer, { text, graph, known: knownThings(note, graph), texts });
  if (!('changes' in read)) return read;
  const made = makeProposal({
    id: 'text-graph',
    graph,
    by: { name: by, kind: 'model' },
    basis: basisOf(note, graph),
    changes: read.changes,
  });
  return 'refused' in made ? { unread: made.refused } : { proposal: made, matched: read.matched };
}
