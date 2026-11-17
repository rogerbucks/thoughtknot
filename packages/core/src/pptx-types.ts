// What a PowerPoint deck is read into, and the limits it is read under (ES§45 board_exchange, ES§67
// format_untrusted_files). The reader is pptx-read.ts; the walk through one slide's shapes is pptx-shapes.ts.
import type { PictureEnding } from './picture-keep.ts';
import type { Spent } from './pptx-xml.ts';
import type { ZipEntry } from './zip-read.ts';

/** A place on a slide in whole pixels (96 to the inch): its corner, and its width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One paragraph of a text: its words, how deep it is indented, and whether it is a bullet or a numbered line. */
export interface Para {
  text: string;
  level: number;
  bullet: 'none' | 'dot' | 'number';
}

/** One thing on a slide, in the order the slide holds them. A box is null when no place can be found for it. */
export type Shape =
  | { kind: 'text'; title: boolean; box: Box | null; paras: Para[] }
  | { kind: 'shape'; geom: 'box' | 'ellipse'; box: Box | null; paras: Para[] }
  | { kind: 'picture'; box: Box | null; alt: string; part: string }
  | { kind: 'table'; box: Box | null; rows: string[][] };

/** One slide: its place in the deck from 1, whether it is hidden, its title, its shapes and its speaker notes. */
export interface Slide {
  n: number;
  hidden: boolean;
  title: string;
  shapes: Shape[];
  notes: string;
}

/** A picture of the deck that can be kept: its part in the zip, its ending, and its bytes. */
export interface DeckPicture {
  part: string;
  ending: PictureEnding;
  bytes: Uint8Array;
}

/** What was left out, counted: each is how many things were left, not how many slides. */
export interface Left {
  charts: number;
  smartart: number;
  objects: number;
  media: number;
  lines: number;
  pictures: number;
}

/** A deck read: its slide size, its slides, its pictures by part, and what was left out. */
export interface PptxRead {
  size: { w: number; h: number };
  slides: Slide[];
  pictures: Map<string, DeckPicture>;
  left: Left;
}

/** Why a deck was not read, as a sentence naming what to do. */
export interface PptxRefusal {
  why: 'not-pptx' | 'old-or-encrypted' | 'empty' | 'too-large' | 'too-many-slides' | 'text-too-long' | 'damaged';
  refused: string;
}

/** The most a deck may hold: its bytes, one XML part, all inflated bytes, its slides, its shapes and one text. */
export const PPTX_LIMITS = {
  bytes: 64 * 1024 * 1024,
  part: 16 * 1024 * 1024,
  inflated: 192 * 1024 * 1024,
  slides: 500,
  shapes: 20_000,
  text: 100_000,
};

/** Thrown inside the reader when a limit is passed; turned into a refusal at the edge. */
export class Over extends Error {
  why: 'too-large' | 'too-many-slides' | 'text-too-long';
  /** The most that was passed, for the sentence; 0 where none is named. */
  most: number;
  constructor(why: 'too-large' | 'too-many-slides' | 'text-too-long', most = 0) {
    super(why);
    this.why = why;
    this.most = most;
  }
}

/** The place of each placeholder of a layout or master, by its index and by its kind. */
export interface Places {
  byIdx: Map<string, Box>;
  byType: Map<string, Box>;
}

/** What reading one deck needs to hand about: the zip, its limits and counts, and what is kept so far. */
export interface Deck {
  bytes: Uint8Array;
  zip: Map<string, ZipEntry>;
  most: typeof PPTX_LIMITS;
  spent: Spent;
  inflated: number;
  shapes: number;
  pictures: Map<string, DeckPicture>;
  /** Parts seen that cannot be kept as a picture, so each is counted once. */
  refusedParts: Set<string>;
  left: Left;
  places: Map<string, Places>;
}
