// Name cards: part of layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_marks). How big a
// name's card is, and the card itself, for the one label placer. Close in, a long name wraps onto as many as six
// lines, so the whole title shows (Roger, 7 Nov 2026). Host-free and pure.
import type { LabelAsk, LabelMark } from './render-marks.ts';
import { inkOn } from './render-look.ts';

/** The smallest name drawn, in pixels. */
export const MIN_PX = 11;
/** The largest name drawn, in pixels. */
export const MAX_PX = 16;
/** The longest name drawn on one line, in letters; longer names end in an ellipsis. */
export const LONGEST = 28;

/** The width of `text` at `px`, near enough to keep names apart. */
export const textWidth = (text: string, px: number): number => text.length * px * 0.56;

/** The size of a card's second line, such as "13 items", in pixels. */
const SUB_PX = MIN_PX;
/** The most letters on one line of a wrapped name. */
export const LINE = 22;
/** The most lines a name wraps onto. */
export const MOST_LINES = 6;
/** The height of each line after the first, as a share of the name's size. */
const LEADING = 1.25;

/**
 * `text` wrapped onto at most `most` lines of at most `width` letters, breaking between words where it can. A word
 * longer than a line is broken. What does not fit ends the last line with an ellipsis.
 */
export function wrapName(text: string, width: number, most: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean))
    for (let rest = word; rest;) {
      const room = line ? width - line.length - 1 : width;
      if (rest.length <= room) {
        line = line ? `${line} ${rest}` : rest;
        rest = '';
      } else if (line && rest.length <= width) {
        lines.push(line);
        line = '';
      } else {
        // longer than a line: as much as fits, the rest on the next
        const cut = Math.max(1, room);
        line = line ? `${line} ${rest.slice(0, cut)}` : rest.slice(0, cut);
        rest = rest.slice(cut);
        lines.push(line);
        line = '';
      }
    }
  if (line) lines.push(line);
  if (lines.length <= most) return lines;
  const kept = lines.slice(0, most);
  const last = kept[most - 1] as string;
  kept[most - 1] = `${last.length >= width ? last.slice(0, width - 1) : last}…`;
  return kept;
}

/** How big a name's card is on `lines` lines: its size held between MIN_PX and MAX_PX, one line cut to LONGEST letters. */
export function sizeOf(ask: LabelAsk, lines = 1): { text: string; px: number; w: number; h: number; lines?: string[] } {
  const px = Math.min(MAX_PX, Math.max(MIN_PX, ask.px));
  const wrapped = lines > 1 ? wrapName(ask.text, LINE, Math.min(lines, MOST_LINES)) : [];
  const text = ask.text.length > LONGEST ? `${ask.text.slice(0, LONGEST - 1)}…` : ask.text;
  const shown = wrapped.length > 1 ? wrapped : [text];
  const widest = Math.max(...shown.map((l) => textWidth(l, px)));
  const w = Math.max(widest, ask.sub ? textWidth(ask.sub, SUB_PX) : 0) + px + (ask.dot ? px : 0),
    h = px * 1.6 + (shown.length - 1) * px * LEADING + (ask.sub ? SUB_PX * 1.2 : 0);
  return wrapped.length > 1 ? { text: ask.text, px, w, h, lines: wrapped } : { text, px, w, h };
}

/** The card of `ask`, of `size`, at `box`. */
export function labelOf(
  ask: LabelAsk,
  size: { text: string; px: number; lines?: string[] },
  box: { x: number; y: number; w: number; h: number },
): LabelMark {
  return {
    kind: 'label',
    key: ask.key,
    text: size.text,
    ...box,
    px: size.px,
    fill: ask.fill,
    ink: ask.ink ?? inkOn(ask.fill),
    alpha: ask.alpha,
    ...(size.lines ? { lines: size.lines } : {}),
    ...(ask.dot ? { dot: ask.dot } : {}),
    ...(ask.edge ? { edge: ask.edge } : {}),
    ...(ask.sub ? { sub: ask.sub, subPx: SUB_PX, subInk: ask.subInk ?? ask.ink ?? inkOn(ask.fill) } : {}),
  };
}
