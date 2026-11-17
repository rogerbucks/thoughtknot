// A PowerPoint presentation brought onto a board (editor spec ES§45, board_exchange). Each slide becomes a frame of its
// own, so the board plays as the deck did (board_slides). Host-free: the host reads the file, keeps the pictures and
// writes the block. The reader is pptx-read.ts, in plain JavaScript: no library, no WebAssembly and no network.
// - Each frame is as large as its slide, titled by it, numbered in the deck's order; a hidden slide is left out of the
//   show. Frames stand in rows of three, so the board reads like a contact sheet.
// - A title and a text box are text, their bullets as `- ` lines. A shape keeps its place, size and words. A table is
//   its rows, cells joined by ` | `. A picture is an Image that links to a file the host keeps beside the note.
// - Speaker notes are a card under their slide. What was left out is said in a sentence, never silently.
import { writeBoard } from './board.ts';
import type { Board, BoardItem } from './board.ts';
import { pictureStem } from './picture-keep.ts';
import type { PictureEnding } from './picture-keep.ts';
import { pptxSlides } from './pptx-read.ts';
import type { Box, Para, PptxRead, PptxRefusal, Shape, Slide } from './pptx-read.ts';
import { word } from './words.ts';

/** A picture of the deck to keep beside the note: the name it is first linked by, its ending and its bytes. */
export interface KeptPicture {
  name: string;
  ending: PictureEnding;
  bytes: Uint8Array;
}

/** A deck as a board before its pictures are kept: the board, the pictures to keep, and what was left out. */
export interface PptxBoard {
  board: Board;
  pictures: KeptPicture[];
  notes: string[];
}

/** Whether a vault file is a PowerPoint presentation, by its ending. */
export const isPresentationPlace = (path: string): boolean => /\.pptx$/i.test(path);

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// how many slides stand in a row, and the room between them and under each for its notes
const ROW = 3;
const GAP = 120;
const NOTES_H = 220;

/** A paragraph as a line of text: its indent, its bullet or number, then its words. */
function lines(paras: Para[]): string {
  const counts: number[] = [];
  return paras
    .map((p) => {
      counts.length = p.level + 1;
      const mark = p.bullet === 'number' ? `${(counts[p.level] = (counts[p.level] ?? 0) + 1)}. ` : '- ';
      if (p.bullet !== 'number') counts[p.level] = 0;
      return `${'  '.repeat(p.level)}${p.bullet === 'none' ? '' : mark}${p.text}`;
    })
    .join('\n');
}

/** The slide's shapes as items on the board, their places moved to the frame at (`x`, `y`) of size `size`. */
function slideItems(slide: Slide, at: { x: number; y: number }, size: Box, pics: Map<string, string>): BoardItem[] {
  const out: BoardItem[] = [];
  // a shape with no place is stacked under the ones that have one
  let free = Math.min(size.h - 100, Math.max(40, ...slide.shapes.flatMap((s) => (s.box ? [s.box.y + s.box.h] : []))));
  const put = (s: Shape, item: Omit<BoardItem, 'id' | 'x' | 'y'>) => {
    let box = s.box;
    if (!box) {
      box = { x: 40, y: Math.max(0, free), w: size.w - 80, h: 80 };
      free += 100;
    }
    out.push({
      id: `s${slide.n}_${out.length + 1}`,
      x: at.x + box.x,
      y: at.y + box.y,
      w: Math.max(1, box.w),
      h: Math.max(1, box.h),
      ...item,
    });
  };
  for (const s of slide.shapes) {
    if (s.kind === 'text') put(s, { kind: 'Text', text: lines(s.paras), more: {} });
    else if (s.kind === 'table') put(s, { kind: 'Text', text: s.rows.map((r) => r.join(' | ')).join('\n'), more: {} });
    else if (s.kind === 'shape') {
      const text = lines(s.paras);
      put(s, { kind: 'Shape', ...(text ? { text } : {}), more: { shape: s.geom } });
    } else {
      const src = pics.get(s.part);
      if (src) put(s, { kind: 'Image', more: s.alt ? { src, alt: s.alt } : { src } });
    }
  }
  return out;
}

/** The sentences for what was left out of a deck: the things counted, then the look that is never kept. */
function sentences(read: PptxRead): string[] {
  const things = (Object.keys(read.left) as (keyof typeof read.left)[]).flatMap((k) =>
    read.left[k] ? [word(`reading.pptx.left.${k}`, { count: read.left[k] })] : [],
  );
  return [
    ...(things.length ? [word('reading.pptx.left', { things: things.join(', ') })] : []),
    word('reading.pptx.look'),
  ];
}

/**
 * The board of an already read deck, named `graph`, for the presentation at `place`. Its pictures are named after
 * the file and numbered, and each Image links to its name; the host keeps them, then calls `pptxBlock`.
 */
export function deckBoard(read: PptxRead, graph: string, place: string): PptxBoard | { refused: string } {
  if (!NAME.test(graph)) return { refused: word('import.not-graph-name', { graph }) };
  const stem = pictureStem(place);
  const pictures: KeptPicture[] = [];
  const names = new Map<string, string>();
  const items: BoardItem[] = [];
  let shown = 0;
  read.slides.forEach((slide, i) => {
    for (const s of slide.shapes) {
      const pic = s.kind === 'picture' ? read.pictures.get(s.part) : undefined;
      if (!pic || names.has(pic.part)) continue;
      const name = `${stem}-${names.size + 1}.${pic.ending}`;
      names.set(pic.part, name);
      pictures.push({ name, ending: pic.ending, bytes: pic.bytes });
    }
    const [col, row] = [i % ROW, Math.floor(i / ROW)];
    const at = { x: col * (read.size.w + GAP), y: row * (read.size.h + NOTES_H + GAP) };
    const frame: BoardItem = {
      id: `s${slide.n}`,
      kind: 'Frame',
      ...at,
      w: read.size.w,
      h: read.size.h,
      text: slide.title || `Slide ${slide.n}`,
      more: { slide: slide.hidden ? 0 : ++shown },
    };
    items.push(frame, ...slideItems(slide, at, { x: 0, y: 0, ...read.size }, names));
    if (slide.notes)
      items.push({
        id: `s${slide.n}_notes`,
        kind: 'Card',
        x: at.x,
        y: at.y + read.size.h + 24,
        w: Math.min(read.size.w, 480),
        h: NOTES_H - 48,
        text: word('reading.pptx.notes-title', { n: slide.n }),
        more: { body: slide.notes },
      });
  });
  return { board: { name: graph, on: null, items, connectors: [] }, pictures, notes: sentences(read) };
}

/** The board of a PowerPoint file's bytes, or why it was refused. */
export function pptxBoard(
  bytes: Uint8Array,
  graph: string,
  place: string,
): PptxBoard | PptxRefusal | { refused: string } {
  const read = pptxSlides(bytes);
  return 'slides' in read ? deckBoard(read, graph, place) : read;
}

/**
 * The block for the note, once the host has kept the pictures. `kept` maps each picture's name to the path it was
 * kept at. An Image whose picture was not kept is left out, and the sentences say how many.
 */
export function pptxBlock(made: PptxBoard, kept: ReadonlyMap<string, string>): { block: string; notes: string[] } {
  let unsaved = 0;
  const items = made.board.items.flatMap((item): BoardItem[] => {
    if (item.kind !== 'Image') return [item];
    const path = kept.get(typeof item.more.src === 'string' ? item.more.src : '');
    if (!path) {
      unsaved++;
      return [];
    }
    return [{ ...item, more: { ...item.more, src: path } }];
  });
  const notes = unsaved
    ? [word('reading.pptx.left', { things: word('reading.pptx.left.unsaved', { count: unsaved }) }), ...made.notes]
    : made.notes;
  return { block: `\`\`\`gql\n${writeBoard({ ...made.board, items })}\n\`\`\``, notes };
}
