// The connector for plain text: a .txt file (editor spec §63, connector_text_proposed, connector_files_to_gql).
// - Prose is never read as fact. The file gives no statements, only its text, offered to text to graph (§47). Its
//   answer comes back as a proposal (§17), and nothing is drawn until a person accepts it.
// - Each change of that proposal cites the file and the line of the words it came from. So a person sees where in the
//   file each thing was read.
// - Read on the device, to the size text to graph accepts. Host-free and pure.
import { sha256 } from './ai-digest.ts';
import type { Connected, Connector } from './connectors.ts';
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';
import { basisOf } from './proposals-basis.ts';
import { makeProposal } from './proposals.ts';
import type { Proposal } from './proposals.ts';
import { placeKey, readSource } from './sources.ts';
import { TEXT_MOST, knownThings, textGraphIn } from './text-to-graph.ts';
import type { Matched } from './text-to-graph.ts';
import { word } from './words.ts';

/** The line, counted from 1, that character `at` of `text` is on. */
export function lineAt(text: string, at: number): number {
  let line = 1;
  for (let i = 0; i < at && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/** The connector for a .txt file: no statements, its text kept as prose for a person to turn into a proposal. */
export const textConnector: Connector = {
  kinds: ['text'],
  connect(source, fetched) {
    const place = placeKey(source);
    if (!('text' in fetched)) {
      const said = readSource(source, fetched);
      if ('refused' in said) return said;
      return {
        source,
        why: 'unreadable',
        refused: word('reading.source.place-too-large', { place, graph: source.graph }),
      };
    }
    if (fetched.text.length > TEXT_MOST)
      return { source, why: 'unreadable', refused: word('reading.text.too-long', { place, most: String(TEXT_MOST) }) };
    const block = `// graph: ${source.graph}`;
    const read = { source, from: fetched.found, texts: [block], lines: [0], reading: readNote([block]) };
    const connected: Connected = { source, place, version: sha256(fetched.text), statements: [], read };
    connected.prose = fetched.text;
    connected.note = word('reading.text.proposal-only', { place });
    return connected;
  },
};

/**
 * A model's text-to-graph answer for the prose at `place`, as a proposal by `by` on `graph` of `note`. Each change's
 * reason cites the place and the line its words are on. Or why the answer cannot be read, or the model's question.
 */
export function proseProposal(
  note: string,
  graph: string,
  prose: { place: string; text: string },
  answer: string,
  by: string,
): { proposal: Proposal; matched: Matched[] } | { unread: string } | { asks: string } {
  const texts = gqlBlocks(note).map((b) => b.text);
  const read = textGraphIn(answer, { text: prose.text, graph, known: knownThings(note, graph), texts });
  if (!('changes' in read)) return read;
  const changes = read.changes.map((c, i) => {
    const span = read.spans[i];
    if (!span) return c;
    const line = String(lineAt(prose.text, span.from));
    return { ...c, reason: word('reading.text.cites', { place: prose.place, line, words: span.words }) };
  });
  const made = makeProposal({
    id: 'text-graph',
    graph,
    by: { name: by, kind: 'model' },
    basis: basisOf(note, graph),
    changes,
  });
  return 'refused' in made ? { unread: made.refused } : { proposal: made, matched: read.matched };
}
