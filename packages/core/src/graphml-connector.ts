// A GraphML file after FROM (ES§63 connector_files_to_gql; ES§67 format_loss_stated, format_untrusted_files):
// `· FROM Data/map.graphml`. It meets the one contract, as a CSV file does.
// - Read in plain JavaScript (graphml-read.ts): no library. Nothing in the file can run or be fetched.
// - A graph, not a table, so it needs no mapping: each node is a thing, each edge a link, as GraphML says.
// - Each statement cites the place, the file's hash and the line its node or edge starts on.
// - What the file held that the graph cannot keep is said in the read's note, never dropped unsaid.
import { sha256 } from './ai-digest.ts';
import type { Connected, Connector, Statement } from './connectors.ts';
import { readNote } from './drawing.ts';
import { gqlLines } from './export-data-gql.ts';
import { readGraphml } from './graphml-read.ts';
import { placeKey, readSource } from './sources.ts';
import { word } from './words.ts';

/** The connector for a .graphml file: its nodes and edges as things and links, each citing its line. */
export const graphmlConnector: Connector = {
  kinds: ['graphml'],
  connect(source, fetched, shared = []) {
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
    const read = readGraphml(place, fetched.text);
    if ('refused' in read) return { source, why: 'unreadable', refused: read.refused };
    const version = sha256(fetched.text);
    const { things, links } = gqlLines(read);
    const cite = (line: number) => ({ place, version, line });
    const statements: Statement[] = [
      ...things.map((text, i) => ({ text, cite: cite(read.thingLines[i] ?? 0) })),
      ...links.map((text, i) => ({ text, cite: cite(read.linkLines[i] ?? 0) })),
    ];
    const block = [`// graph: ${source.graph}`, ...statements.map((s) => s.text)].join('\n');
    const reading = readNote([block], 0, shared);
    const connected: Connected = {
      source,
      place,
      version,
      statements,
      read: { source, from: fetched.found, texts: [block], lines: [0], reading },
    };
    if (read.dropped.length)
      connected.note = word('reading.graphml.left-out', { place, what: read.dropped.join('; ') });
    return connected;
  },
};
