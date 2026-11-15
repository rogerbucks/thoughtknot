// A Word document (.docx) read as blocks of text, in plain JavaScript (ES§63 connector_files_to_gql, ES§67
// format_untrusted_files). No library, no WebAssembly and no network.
// - A document is a zip of XML files. So it reads the zip, inflates `word/document.xml` and scans the XML.
// - Read-only. It never runs a macro, a field or a link. A link gives its words, an image gives nothing.
// - Untrusted: every size is checked, a document type line is refused, and so is a file over the limits.
// - Loss stated: styles other than headings, comments, footnotes, headers, images and text boxes are not read.
//   Text a tracked change deleted is left out; text it inserted is kept.
import { word } from './words.ts';
import { tokens } from './xml-scan.ts';
import { Damaged, TooBig, partText, zipEntries } from './zip-read.ts';

/** One block of the document, in the order the document holds them. */
export type DocBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; text: string }
  | { kind: 'table'; rows: string[][] };

/** Why a document was not read, as a sentence naming what to do. */
export interface DocxRefusal {
  why: 'not-docx' | 'old-or-encrypted' | 'too-large' | 'too-many-blocks' | 'block-too-long' | 'damaged';
  refused: string;
}

/** The most a document may hold before it is refused: its bytes, its inflated text, its blocks, and one block. */
export const DOCX_LIMITS = { bytes: 32 * 1024 * 1024, part: 64 * 1024 * 1024, blocks: 50_000, text: 100_000 };

/** Thrown inside the reader when a limit is passed; turned into a refusal at the edge. */
class Over extends Error {
  why: 'too-large' | 'too-many-blocks' | 'block-too-long';
  constructor(why: 'too-large' | 'too-many-blocks' | 'block-too-long') {
    super(why);
    this.why = why;
  }
}

/** The heading level a paragraph style names (`Title` 0, `Heading2` 2), or null when it is no heading. */
function headingLevel(style: string): number | null {
  if (style.toLowerCase() === 'title') return 0;
  const m = /^heading\s*([1-9])$/i.exec(style);
  return m ? Number(m[1]) : null;
}

/** The blocks of `word/document.xml`. A table's cells are joined paragraphs; a nested table's text joins its cell. */
function blocksOf(xml: string, limits: typeof DOCX_LIMITS): DocBlock[] {
  const out: DocBlock[] = [];
  const add = (b: DocBlock) => {
    if (out.length >= limits.blocks) throw new Over('too-many-blocks');
    out.push(b);
  };
  let [depth, deleted, inText] = [0, 0, false];
  let [text, style, listed] = ['', '', false];
  let [rows, row, cell]: [string[][], string[], string[]] = [[], [], []];
  const grow = (s: string) => {
    text += s;
    if (text.length > limits.text) throw new Over('block-too-long');
  };
  for (const t of tokens(xml)) {
    if ('text' in t) {
      if (inText && !deleted) grow(t.text);
    } else if ('open' in t) {
      const n = t.open;
      if (n === 'tbl') depth++;
      else if (n === 'p') [text, style, listed] = ['', '', false];
      else if (n === 'pStyle') style = t.attrs.val ?? '';
      else if (n === 'numPr') listed = true;
      else if (n === 'del') deleted++;
      else if (n === 't') inText = true;
      else if (n === 'tab' && !deleted) grow('\t');
      else if ((n === 'br' || n === 'cr') && !deleted) grow('\n');
      else if (n === 'tr' && depth === 1) row = [];
      else if (n === 'tc' && depth === 1) cell = [];
    } else {
      const n = t.close;
      if (n === 't') inText = false;
      else if (n === 'del') deleted = Math.max(0, deleted - 1);
      else if (n === 'p') {
        const trimmed = text.trim();
        if (depth > 0) {
          if (trimmed) cell.push(trimmed);
        } else if (trimmed) {
          const level = headingLevel(style);
          if (level !== null) add({ kind: 'heading', level, text: trimmed });
          else add(listed ? { kind: 'list', text: trimmed } : { kind: 'paragraph', text: text.trimEnd() });
        }
      } else if (n === 'tc' && depth === 1) row.push(cell.join('\n'));
      else if (n === 'tr' && depth === 1) rows.push(row);
      else if (n === 'tbl') {
        depth = Math.max(0, depth - 1);
        if (depth === 0) {
          if (rows.length > 0) add({ kind: 'table', rows });
          rows = [];
        }
      }
    }
  }
  return out;
}

function refusalOf(e: unknown): DocxRefusal {
  if (e instanceof TooBig) return refusalOf(new Over('too-large'));
  if (e instanceof Over)
    return {
      why: e.why,
      refused: word(`reading.docx.${e.why}`, {
        most: String(
          e.why === 'too-large'
            ? DOCX_LIMITS.part
            : e.why === 'too-many-blocks'
              ? DOCX_LIMITS.blocks
              : DOCX_LIMITS.text,
        ),
      }),
    };
  if (e instanceof Damaged || e instanceof RangeError) return { why: 'damaged', refused: word('reading.docx.damaged') };
  throw e;
}

/** An old Word file (.doc) and an encrypted .docx are both Microsoft's compound file, which starts with these bytes. */
const COMPOUND = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * The blocks of a Word document, in order; or why it cannot be read. `limits` lowers the most it may hold, for tests.
 */
export function docxBlocks(
  bytes: Uint8Array,
  limits: Partial<typeof DOCX_LIMITS> = {},
): { blocks: DocBlock[] } | DocxRefusal {
  const most = { ...DOCX_LIMITS, ...limits };
  try {
    if (bytes.length > most.bytes) throw new Over('too-large');
    if (COMPOUND.every((b, i) => bytes[i] === b))
      return { why: 'old-or-encrypted', refused: word('reading.docx.old-or-encrypted') };
    let zip;
    try {
      zip = zipEntries(bytes);
    } catch (e) {
      if (e instanceof Damaged) return { why: 'not-docx', refused: word('reading.docx.not-docx') };
      throw e;
    }
    const xml = partText(bytes, zip, 'word/document.xml', most.part);
    if (xml === null) return { why: 'not-docx', refused: word('reading.docx.not-docx') };
    return { blocks: blocksOf(xml, most) };
  } catch (e) {
    return refusalOf(e);
  }
}
