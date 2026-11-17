// A Word document or a PDF after FROM (ES§63 connector_text_proposed, connector_files_to_gql; ES§67
// format_untrusted_files): `· FROM Data/report.docx`. It is read as a plain text file is: no statements, only its text.
// - Read in plain JavaScript (document-text.ts): no library, no WebAssembly. Nothing in the file can run or be written.
// - Prose is never read as fact. The text is offered to text to graph (ES§47) and comes back as a proposal, which a
//   person accepts. Each change cites a line of the text read from the file, not a line of the file itself.
import type { Connector } from './connectors.ts';
import { documentText } from './document-text.ts';
import { placeKey, readSource } from './sources.ts';
import { proseConnected } from './text-connector.ts';
import { word } from './words.ts';

/** The connector for a Word document or a PDF: its text kept as prose for a person to turn into a proposal. */
export const documentConnector: Connector = {
  kinds: ['document'],
  connect(source, fetched) {
    const place = placeKey(source);
    // read already by the host, in a worker under a time limit (document-reader.ts)
    if ('document' in fetched)
      return proseConnected(
        source,
        place,
        fetched.found,
        fetched.document,
        word('reading.document.proposal-only', { place }),
      );
    if (!('bytes' in fetched)) {
      const said = readSource(source, fetched);
      if ('refused' in said) return said;
      return {
        source,
        why: 'unreadable',
        refused: word('reading.source.place-too-large', { place, graph: source.graph }),
      };
    }
    const read = documentText(fetched.bytes, place);
    if ('refused' in read) return { source, why: 'unreadable', refused: read.refused };
    return proseConnected(source, place, fetched.found, read.text, word('reading.document.proposal-only', { place }));
  },
};
