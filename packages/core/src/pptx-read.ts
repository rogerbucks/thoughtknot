// A PowerPoint file (.pptx) read as slides, in plain JavaScript (ES§45 board_exchange, ES§67 format_untrusted_files).
// No library, no WebAssembly and no network.
// - A deck is a zip of XML parts. It reads the slide order, then each slide's text, pictures, tables, shapes and notes.
//   A shape with no place of its own takes the place its slide layout or master gives it.
// - Read-only. It never runs a macro, an embedded object or a link. A link to the web is never followed.
// - Untrusted: the file, each part, the slides, the shapes, the nodes and each text are all checked against limits.
//   A part that lies about its size is refused.
// - A picture is kept only when its first bytes say PNG, JPEG, GIF or WebP, and it is within the picture size limit.
//   Any other picture is counted as left out.
// - Loss stated: charts, SmartArt, embedded objects, video, sound and lines are left out and counted. Colours, fonts,
//   backgrounds, animations and transitions are not read. A picture's crop and a shape's turn are not read.
import { placesOf, px, textOf, walk } from './pptx-shapes.ts';
import { Over, PPTX_LIMITS } from './pptx-types.ts';
import type { Deck, Left, Places, PptxRead, PptxRefusal, Slide } from './pptx-types.ts';
import { kid, kidsOf, relsName, relsOf, xmlTree } from './pptx-xml.ts';
import type { Rels, XNode } from './pptx-xml.ts';
import { word } from './words.ts';
import { Damaged, TooBig, partBytes, utf8, zipEntries } from './zip-read.ts';
import type { ZipEntry } from './zip-read.ts';

export { PPTX_LIMITS } from './pptx-types.ts';
export type { Box, DeckPicture, Left, Para, PptxRead, PptxRefusal, Shape, Slide } from './pptx-types.ts';

/** The tree of the XML part `name`, or undefined when the zip has none. */
function treeOf(d: Deck, name: string): XNode | undefined {
  const e = d.zip.get(name.toLowerCase());
  if (!e) return undefined;
  if ((d.inflated += e.size) > d.most.inflated) throw new Over('too-large');
  const raw = partBytes(d.bytes, d.zip, name, d.most.part);
  return raw === null ? undefined : xmlTree(utf8(raw), d.spent);
}

/** The relationships of the part `name`; empty when it has none. */
const relsFor = (d: Deck, name: string): Rels => relsOf(kid(treeOf(d, relsName(name)), 'Relationships'), name);

/** The text of a notes page: the paragraphs of its notes placeholder, one to a line. */
function notesOf(d: Deck, name: string): string {
  const tree = treeOf(d, name);
  const lines: string[] = [];
  for (const sp of kidsOf(kid(kid(kid(tree, 'notes'), 'cSld'), 'spTree'), 'sp')) {
    if (kid(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph')?.attrs.type !== 'body') continue;
    for (const p of kidsOf(kid(sp, 'txBody'), 'p')) {
      const t = textOf(p, d.most.text).trim();
      if (t) lines.push(t);
    }
  }
  return lines.join('\n');
}

/** The places a layout and its master give, read once for each layout. */
function placesFor(d: Deck, layoutPart: string): { layout: Places | null; master: Places | null } {
  const cached = d.places.get(layoutPart);
  const masterPart = (): string | undefined =>
    [...relsFor(d, layoutPart).byId.values()].find((r) => r.type === 'slideMaster')?.part;
  if (cached) return { layout: cached, master: d.places.get(`${layoutPart}\0master`) ?? null };
  const mpart = masterPart();
  const mtree = mpart ? treeOf(d, mpart) : undefined;
  const master = mtree ? placesOf(mtree, null) : null;
  const ltree = treeOf(d, layoutPart);
  const layout = ltree ? placesOf(ltree, master) : null;
  if (layout) d.places.set(layoutPart, layout);
  if (master) d.places.set(`${layoutPart}\0master`, master);
  return { layout, master };
}

/** The slide at `part` as a number `n` of the deck: its shapes, its title and its notes. */
function slideOf(d: Deck, part: string, n: number): Slide {
  const tree = treeOf(d, part);
  const sld = kid(tree, 'sld');
  const spTree = kid(kid(sld, 'cSld'), 'spTree');
  if (!sld || !spTree) throw new Damaged();
  const rels = relsFor(d, part);
  const layoutPart = [...rels.byId.values()].find((r) => r.type === 'slideLayout')?.part;
  const { layout, master } = layoutPart ? placesFor(d, layoutPart) : { layout: null, master: null };
  const shapes = walk(d, spTree, rels, layout, master);
  const notesPart = [...rels.byId.values()].find((r) => r.type === 'notesSlide')?.part;
  const heading = shapes.find((s) => s.kind === 'text' && s.title);
  const title =
    heading && heading.kind === 'text' ? heading.paras.map((p) => p.text.replace(/\s*\n\s*/g, ' ')).join(' ') : '';
  return { n, hidden: sld.attrs.show === '0', title, shapes, notes: notesPart ? notesOf(d, notesPart) : '' };
}

function refusalOf(e: unknown): PptxRefusal {
  if (e instanceof TooBig) return refusalOf(new Over('too-large'));
  if (e instanceof Over) {
    return { why: e.why, refused: word(`reading.pptx.${e.why}`, { most: String(e.most) }) };
  }
  if (e instanceof Damaged || e instanceof RangeError) return { why: 'damaged', refused: word('reading.pptx.damaged') };
  throw e;
}

/** An old PowerPoint file (.ppt) and an encrypted .pptx are both Microsoft's compound file, which starts with these. */
const COMPOUND = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** The slide parts of the deck in order, by `sldIdLst` and the relationships of `presentation.xml`. */
function slideParts(d: Deck, pres: XNode, rels: Rels): string[] {
  const list = kid(kid(pres, 'presentation'), 'sldIdLst');
  const out: string[] = [];
  for (const id of kidsOf(list, 'sldId')) {
    const rid = /\s\w+:id\s*=\s*["']([^"']*)["']/.exec(id.raw ?? '')?.[1];
    const rel = rid === undefined ? undefined : rels.byId.get(rid);
    if (rel && rel.type === 'slide') out.push(rel.part);
    if (out.length > d.most.slides) throw new Over('too-many-slides', d.most.slides);
  }
  return out;
}

/**
 * The slides of a PowerPoint deck, in order, with the pictures they use; or why it cannot be read. `limits` lowers the
 * most it may hold, for tests. A slide that cannot be read as XML refuses the whole deck, never a part of it.
 */
export function pptxSlides(bytes: Uint8Array, limits: Partial<typeof PPTX_LIMITS> = {}): PptxRead | PptxRefusal {
  const most = { ...PPTX_LIMITS, ...limits };
  const not = (why: 'not-pptx' | 'old-or-encrypted' | 'empty'): PptxRefusal => ({
    why,
    refused: word(`reading.pptx.${why}`),
  });
  try {
    if (bytes.length > most.bytes) throw new Over('too-large');
    if (COMPOUND.every((b, i) => bytes[i] === b)) return not('old-or-encrypted');
    let zip: Map<string, ZipEntry>;
    try {
      zip = zipEntries(bytes);
    } catch (e) {
      if (e instanceof Damaged) return not('not-pptx');
      throw e;
    }
    const left: Left = { charts: 0, smartart: 0, objects: 0, media: 0, lines: 0, pictures: 0 };
    const d: Deck = {
      bytes,
      zip,
      most,
      spent: { nodes: 0 },
      inflated: 0,
      shapes: 0,
      pictures: new Map(),
      refusedParts: new Set(),
      left,
      places: new Map(),
    };
    const pres = treeOf(d, 'ppt/presentation.xml');
    if (!pres) return not('not-pptx');
    const sz = kid(kid(pres, 'presentation'), 'sldSz');
    const size = { w: px(sz?.attrs.cx) || 1280, h: px(sz?.attrs.cy) || 720 };
    const parts = slideParts(d, pres, relsFor(d, 'ppt/presentation.xml'));
    const slides = parts.map((part, i) => slideOf(d, part, i + 1));
    if (!slides.length) return not('empty');
    return { size, slides, pictures: d.pictures, left };
  } catch (e) {
    return refusalOf(e);
  }
}
