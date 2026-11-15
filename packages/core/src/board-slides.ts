// The slides of a board (editor spec §45, board_slides). Each frame is a slide, so a board plays like a deck with
// nothing more to make. The frames play in reading order: top to bottom, then left to right. Once the person orders
// them, each frame keeps its number as `slide: 2`. A frame with `slide: 0` is left out of the show.
//
// Presenting writes nothing and moves nothing on the board. It only moves the view, frame to frame, and the view
// goes back where it was when the show ends (never disorient).
import { itemGql } from './board.ts';
import type { Board, BoardItem } from './board.ts';
import { seenBoard } from './board-layers.ts';
import { itemBox, type Box } from './board-svg.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';
import { MAX_SCALE } from './zoom-fit.ts';

/** The property of a frame that holds its number in the show: 1 is first, 0 leaves it out. */
export const SLIDE = 'slide';

/** One edit to the show. */
export type SlideChange =
  /** One step earlier (-1) or later (1) in the show. */
  | { kind: 'slide-step'; id: string; by: 1 | -1 }
  /** Leaves a frame out of the show, or puts it back at the end. */
  | { kind: 'slide-skip'; id: string; skip: boolean };

/** Whether a change is one to the show. */
export const isSlideChange = (change: { kind: string }): change is SlideChange =>
  change.kind === 'slide-step' || change.kind === 'slide-skip';

/** The number a frame holds, or undefined when it holds none. */
const numberOf = (item: BoardItem): number | undefined => {
  const n = item.more[SLIDE];
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Whether a frame is left out of the show. */
export const skipped = (item: BoardItem): boolean => numberOf(item) === 0;

/**
 * The slides in the order they play: the numbered frames by number, then the rest in reading order. Frames left out,
 * and frames of a hidden layer, are not among them.
 */
export function slidesOf(board: Board): BoardItem[] {
  const frames = seenBoard(board).items.filter((i) => i.kind === 'Frame' && !skipped(i));
  const reading = (a: BoardItem, b: BoardItem) => a.y - b.y || a.x - b.x;
  const numbered = frames.filter((f) => numberOf(f) !== undefined);
  const rest = frames.filter((f) => numberOf(f) === undefined);
  return [
    ...numbered.sort((a, b) => (numberOf(a) as number) - (numberOf(b) as number) || reading(a, b)),
    ...rest.sort(reading),
  ];
}

/** What is said of slide `at` (from 0) of the show: its place in it, and the frame's title when it has one. */
export function slideSaid(slides: readonly BoardItem[], at: number): string {
  const title = slides[at]?.text?.trim();
  const vars = { n: at + 1, of: slides.length };
  return title ? word('board.slides.said', { ...vars, title }) : word('board.slides.said-untitled', vars);
}

/** Where a view is: its scale, and where the drawing's corner sits in the viewport. */
export interface SlidePlace {
  scale: number;
  x: number;
  y: number;
}

/** The room left round a slide on the screen, as a part of the screen's shorter side. */
export const SLIDE_MARGIN = 0.04;

/**
 * The view that shows the box `slide` whole and centred in a viewport, as large as fits with a little room round
 * it. `frame` is the part of the board drawn, whose corner the view is measured from.
 */
export function slidePlace(slide: Box, frame: Box, viewport: { width: number; height: number }): SlidePlace {
  const room = Math.min(viewport.width, viewport.height) * SLIDE_MARGIN;
  const fit = Math.min((viewport.width - 2 * room) / slide.w, (viewport.height - 2 * room) / slide.h);
  const scale = Math.min(MAX_SCALE, Math.max(fit, 0.01));
  return {
    scale,
    x: viewport.width / 2 - (slide.x - frame.x + slide.w / 2) * scale,
    y: viewport.height / 2 - (slide.y - frame.y + slide.h / 2) * scale,
  };
}

/** The slide that holds the spot `at` of the board, to start the show from where the person is; else the first. */
export function slideAt(slides: readonly BoardItem[], at: [number, number]): number {
  const i = slides.findIndex((s) => {
    const b = itemBox(s);
    return at[0] >= b.x && at[0] <= b.x + b.w && at[1] >= b.y && at[1] <= b.y + b.h;
  });
  return Math.max(0, i);
}

/** The block with the frame `item` written again with its number set, or taken off with null. */
function numbered(text: string, item: BoardItem, n: number | null): string {
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === item.id);
  if (!w) return text;
  const more = { ...item.more };
  delete more[SLIDE];
  if (n !== null) more[SLIDE] = n;
  return text.slice(0, w.open) + itemGql({ ...item, more }) + text.slice(w.close + 1);
}

/**
 * The block with a change to the show made, or why it was refused. Only the lines of the frames whose number
 * changes are written again. A step numbers every slide, so the order the person saw is the order kept.
 */
export function slideEdit(text: string, board: Board, change: SlideChange): { text: string } | { refused: string } {
  const frame = board.items.find((i) => i.id === change.id && i.kind === 'Frame');
  if (!frame) return { refused: word('board.slides.gone', { id: change.id }) };
  if (change.kind === 'slide-skip') {
    if (skipped(frame) === change.skip) return { text };
    const last = Math.max(0, ...slidesOf(board).map((s) => numberOf(s) ?? 0));
    // put back: after the numbered slides when there are any, else in reading order again
    return { text: numbered(text, frame, change.skip ? 0 : last ? last + 1 : null) };
  }
  const slides = slidesOf(board);
  const at = slides.indexOf(frame);
  const to = at + change.by;
  if (at < 0 || to < 0 || to >= slides.length) return { refused: word('board.slides.edge') };
  [slides[at], slides[to]] = [slides[to] as BoardItem, slides[at] as BoardItem];
  return {
    text: slides.reduce((t, s, i) => (numberOf(s) === i + 1 ? t : numbered(t, s, i + 1)), text),
  };
}
