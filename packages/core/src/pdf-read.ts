// A PDF read as pages of text, in plain JavaScript (ES§63 connector_files_to_gql, ES§67 format_untrusted_files).
// No library, no WebAssembly and no network. The objects are read by pdf-objects.ts; this finds the pages and their text.
// - Text only. It follows the page tree, then each page's content stream. It reads the text-showing operators,
//   with a new line where the text moves down. A wide gap gives a space. Nothing in the file is ever run.
// - Fonts: a font's own `ToUnicode` map is used; a simple font with none is read as Latin-1. A font with no way to
//   decode it gives nothing for its text.
// - Loss stated: scanned pictures, text inside form objects, tables as grids, reading order in columns, and
//   `Differences` encodings are not read. A password-protected PDF is refused, not guessed at.
import { dictOf, nameOf, parseValue, readObjects, resolve, streamText, PDF_LIMITS } from './pdf-objects.ts';
import type { PdfFile, PdfValue } from './pdf-objects.ts';
import { word } from './words.ts';
import { Damaged, TooBig } from './zip-read.ts';

/** One page: its number from 1, and its text. */
export interface PdfPage {
  number: number;
  text: string;
}

/** Why a PDF was not read, as a sentence naming what to do. */
export interface PdfRefusal {
  why: 'not-pdf' | 'encrypted' | 'too-large' | 'too-many-pages' | 'no-text' | 'damaged';
  refused: string;
}

/** The page tree holds more pages than the most allowed. */
class TooMany extends Error {
  most: number;
  constructor(most: number) {
    super('too-many-pages');
    this.most = most;
  }
}

/** The most text kept from one page. */
const PAGE_TEXT = 1_000_000;

/** A font as far as text goes. It holds the text each code maps to and how wide a code is. It says if it can be read. */
interface Font {
  map: Map<number, string> | null;
  width: number;
  readable: boolean;
}

const utf16 = (hex: string): string => {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
};

/** The `ToUnicode` map in `cmap`: each code's text, and the width in bytes of a code. */
function readCMap(cmap: string): { map: Map<number, string>; width: number } {
  const map = new Map<number, string>();
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(cmap);
  const width = space?.[1] ? Math.max(1, Math.min(2, space[1].length / 2)) : 1;
  for (const [, body] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, from, to] of (body ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g))
      map.set(parseInt(from ?? '', 16), utf16(to ?? ''));
  for (const [, body] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, lo, hi, to] of (body ?? '').matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/g,
    )) {
      const [a, b] = [parseInt(lo ?? '', 16), Math.min(parseInt(hi ?? '', 16), parseInt(lo ?? '', 16) + 65535)];
      const targets = [...(to ?? '').matchAll(/<([0-9a-fA-F]*)>/g)].map((t) => t[1] ?? '');
      for (let c = a; c <= b; c++) {
        const t = targets.length > 1 ? targets[c - a] : targets[0];
        if (t === undefined) break;
        map.set(
          c,
          targets.length > 1
            ? utf16(t)
            : utf16(t.slice(0, -4)) + String.fromCharCode(parseInt(t.slice(-4) || '0', 16) + (c - a)),
        );
      }
    }
  return { map, width };
}

function fontOf(f: PdfFile, ref: PdfValue | undefined): Font {
  const dict = dictOf(f, ref);
  const bad: Font = { map: null, width: 1, readable: false };
  if (!dict) return bad;
  const uni = dict.get('ToUnicode');
  if (uni !== undefined && typeof uni === 'object' && uni !== null && 'r' in uni) {
    const cmap = streamText(f, uni.r);
    if (cmap !== null) return { ...readCMap(cmap), readable: true };
  }
  return nameOf(f, dict.get('Subtype')) === 'Type0' ? bad : { map: null, width: 1, readable: true };
}

/** The text a shown string stands for in `font`. */
function decode(font: Font | null, s: string): string {
  if (!font?.readable) return '';
  if (!font.map) return [...s].filter((c) => c >= ' ' && c !== '\x7f').join('');
  let out = '';
  for (let i = 0; i + font.width <= s.length; i += font.width) {
    const code = font.width === 2 ? (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1) : s.charCodeAt(i);
    out += font.map.get(code) ?? '';
  }
  return out;
}

/** The text of one content stream, with the page's fonts by their names. */
function contentText(content: string, fonts: Map<string, Font>): string {
  let [out, font, y]: [string, Font | null, number | null] = ['', null, null];
  const stack: PdfValue[] = [];
  const line = () => {
    if (out && !out.endsWith('\n')) out += '\n';
    y = null;
  };
  const space = () => {
    if (out && !/\s$/.test(out)) out += ' ';
  };
  const show = (v: PdfValue | undefined) => {
    if (typeof v === 'object' && v !== null && 's' in v) out += decode(font, v.s);
    if (out.length > PAGE_TEXT) throw new TooBig();
  };
  const num = (v: PdfValue | undefined) => (typeof v === 'number' ? v : 0);
  for (let i = 0; ;) {
    const next = parseValue(content, i);
    if (!next) break;
    [, i] = next;
    const v = next[0];
    if (typeof v !== 'object' || v === null || !('op' in v)) {
      stack.push(v);
      if (stack.length > 4096) stack.shift();
      continue;
    }
    const [a, b] = [stack[stack.length - 2], stack[stack.length - 1]];
    switch (v.op) {
      case 'Tf':
        font = typeof a === 'object' && a !== null && 'n' in a ? (fonts.get(a.n) ?? null) : null;
        break;
      case 'Tj':
        show(b);
        break;
      case "'":
        line();
        show(b);
        break;
      case '"':
        line();
        show(b);
        break;
      case 'TJ':
        if (Array.isArray(b))
          for (const item of b) {
            if (typeof item === 'number') {
              if (item < -250) space();
            } else show(item);
          }
        break;
      case 'Td':
      case 'TD':
        if (num(b) !== 0) line();
        else if (num(a) > 0) space();
        break;
      case 'T*':
      case 'ET':
        line();
        break;
      case 'Tm':
        if (y !== null && num(b) !== y) line();
        y = num(b);
        break;
      case 'BI': {
        const end = /\sEI(?=\s|$)/.exec(content.slice(i));
        i = end ? i + end.index + end[0].length : content.length;
        break;
      }
    }
    stack.length = 0;
  }
  return out;
}

/** Each page's dictionary and its inherited resources, in order; a loop or a tree too deep is damage. */
function pageList(
  f: PdfFile,
  root: PdfValue | undefined,
  most: number,
): { page: Map<string, PdfValue>; res: PdfValue }[] {
  const out: { page: Map<string, PdfValue>; res: PdfValue }[] = [];
  const seen = new Set<Map<string, PdfValue>>();
  const walk = (node: PdfValue | undefined, res: PdfValue, depth: number) => {
    const d = dictOf(f, node);
    if (!d || seen.has(d) || depth > 32) throw new Damaged();
    seen.add(d);
    const own = d.get('Resources') ?? res;
    const kids = resolve(f, d.get('Kids'));
    if (Array.isArray(kids)) for (const k of kids) walk(k, own, depth + 1);
    else {
      if (out.length >= most) throw new TooMany(most);
      out.push({ page: d, res: own });
    }
  };
  walk(root, null, 0);
  return out;
}

function refusalOf(e: unknown): PdfRefusal {
  if (e instanceof TooMany)
    return { why: 'too-many-pages', refused: word('reading.pdf.too-many-pages', { most: String(e.most) }) };
  if (e instanceof TooBig)
    return { why: 'too-large', refused: word('reading.pdf.too-large', { most: String(PDF_LIMITS.stream) }) };
  if (e instanceof Damaged || e instanceof RangeError) return { why: 'damaged', refused: word('reading.pdf.damaged') };
  throw e;
}

/** The pages of a PDF with their text, or why it cannot be read. `limits` lowers the most it may hold, for tests. */
export function pdfPages(
  bytes: Uint8Array,
  limits: Partial<typeof PDF_LIMITS> = {},
): { pages: PdfPage[] } | PdfRefusal {
  const most = { ...PDF_LIMITS, ...limits };
  try {
    if (bytes.length > most.bytes) throw new TooBig();
    if (!String.fromCharCode(...bytes.subarray(0, 1024)).includes('%PDF-'))
      return { why: 'not-pdf', refused: word('reading.pdf.not-pdf') };
    const f = readObjects(bytes);
    if (/\/Encrypt\s*(<<|\d+\s+\d+\s+R)/.test(f.text))
      return { why: 'encrypted', refused: word('reading.pdf.encrypted') };
    let catalog: Map<string, PdfValue> | null = null;
    for (const v of f.objects.values()) if (v instanceof Map && nameOf(f, v.get('Type')) === 'Catalog') catalog = v;
    if (!catalog) return { why: 'not-pdf', refused: word('reading.pdf.not-pdf') };
    const list = pageList(f, catalog.get('Pages'), most.pages);
    const cache = new Map<PdfValue, Font>();
    const pages = list.map(({ page, res }, n): PdfPage => {
      const fontDict = dictOf(f, dictOf(f, res)?.get('Font'));
      const fonts = new Map<string, Font>();
      for (const [name, ref] of fontDict ?? []) {
        const key = typeof ref === 'object' && ref !== null && 'r' in ref ? ref.r : ref;
        const known = cache.get(key) ?? fontOf(f, ref);
        cache.set(key, known);
        fonts.set(name, known);
      }
      let text = '';
      const held = resolve(f, page.get('Contents'));
      const refs = Array.isArray(held) ? held : [page.get('Contents')];
      for (const r of refs) {
        if (typeof r !== 'object' || r === null || !('r' in r)) continue;
        const body = streamText(f, r.r);
        if (body !== null) text += `${contentText(body, fonts)}\n`;
      }
      return {
        number: n + 1,
        text: text
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      };
    });
    if (pages.length === 0 || pages.every((p) => p.text === ''))
      return { why: 'no-text', refused: word('reading.pdf.no-text') };
    return { pages };
  } catch (e) {
    return refusalOf(e);
  }
}
