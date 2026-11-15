// A Word document or a PDF read as plain text, for a person to turn into a proposal. It serves ES§63
// connector_text_proposed and ES§67 format_untrusted_files. It is read in plain JavaScript (docx-read.ts, pdf-read.ts).
// There is no library and no WebAssembly.
// - Headings keep their level as `#` marks, list items start with `- `, a table row is its cells joined by ` | `.
//   A PDF's pages are told apart by a `[page 2]` line. So the lines a proposal cites are lines of this text.
// - Loss stated: only text. Pictures, comments, footnotes and the look of the page are not read.
import { docxBlocks, DOCX_LIMITS } from './docx-read.ts';
import type { DocBlock } from './docx-read.ts';
import { PDF_LIMITS } from './pdf-objects.ts';
import { pdfPages } from './pdf-read.ts';

/** The most bytes of a Word document or a PDF that is read. */
export const DOCUMENT_LIMITS = { bytes: Math.min(DOCX_LIMITS.bytes, PDF_LIMITS.bytes) };

/** Whether a place is a Word document or a PDF, by its ending. */
export const isDocumentPlace = (place: string): boolean => /\.(docx|pdf)$/i.test(place);

const blockText = (b: DocBlock): string => {
  if (b.kind === 'heading') return `${'#'.repeat(Math.max(1, b.level))} ${b.text}`;
  if (b.kind === 'list') return `- ${b.text}`;
  if (b.kind === 'table') return b.rows.map((r) => r.join(' | ')).join('\n');
  return b.text;
};

/** The text of the document or PDF in `bytes`, by the ending of `place`; or why it was not read. */
export function documentText(bytes: Uint8Array, place: string): { text: string } | { refused: string } {
  if (/\.pdf$/i.test(place)) {
    const got = pdfPages(bytes);
    return 'pages' in got ? { text: got.pages.map((p) => `[page ${p.number}]\n${p.text}`).join('\n\n') } : got;
  }
  const got = docxBlocks(bytes);
  if (!('blocks' in got)) return got;
  return { text: got.blocks.map(blockText).join('\n\n') };
}
