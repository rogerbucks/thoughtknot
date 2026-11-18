// How an item of a board looks (editor spec ES§45, board_format). It has a colour, a line and a size of words, and its
// words may be bold. Each is kept as a property of the item in the board block, so the note stays the only
// store. A colour is one of the theme's hues by name, never a colour value, so it holds in dark mode and in forced
// colours. An item with none of these looks as its kind does. Pure and host-free.
import type { BoardItem } from './board.ts';
import { STYLE_HUES } from './style-graph.ts';

/** The lines an item may be drawn with. */
export const LINES = ['solid', 'dashed', 'dotted'] as const;
/** One line. */
export type Line = (typeof LINES)[number];

/** The sizes an item's words may be. */
export const TEXT_SIZES = ['small', 'normal', 'large'] as const;
/** One size of words. */
export type TextSize = (typeof TEXT_SIZES)[number];

/** How an item looks. A colour of null is its kind's own; a line of null is its kind's own too. */
export interface Format {
  colour: string | null;
  line: Line | null;
  size: TextSize;
  bold: boolean;
}

/** The dashes of each line, as SVG writes them; a solid line has none. */
export const DASHES: Record<Line, string> = { solid: '', dashed: '6 4', dotted: '2 4' };
/** How much larger or smaller each size draws an item's words. */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.8, normal: 1, large: 1.5 };

const isLine = (v: unknown): v is Line => LINES.includes(v as Line);
const isSize = (v: unknown): v is TextSize => TEXT_SIZES.includes(v as TextSize);

/** How an item looks, read from its properties. Anything it does not say, or says in a way not known, is plain. */
export function formatOf(item: BoardItem): Format {
  return {
    colour: item.style && STYLE_HUES.includes(item.style) ? item.style : null,
    line: isLine(item.more.line) ? item.more.line : null,
    size: isSize(item.more.size) ? item.more.size : 'normal',
    bold: item.more.bold === true,
  };
}

/**
 * What a change of look sets on an item, for the board's edit: only what `set` names is changed. A plain value is
 * taken off the item rather than written, so an item made plain again reads as it did before.
 */
export function formatPatch(item: BoardItem, set: Partial<Format>): Partial<BoardItem> {
  const more = { ...item.more };
  const patch: Partial<BoardItem> = {};
  if ('colour' in set) patch.style = set.colour && STYLE_HUES.includes(set.colour) ? set.colour : undefined;
  if ('line' in set) {
    if (set.line) more.line = set.line;
    else delete more.line;
  }
  if ('size' in set) {
    if (set.size && set.size !== 'normal') more.size = set.size;
    else delete more.size;
  }
  if ('bold' in set) {
    if (set.bold) more.bold = true;
    else delete more.bold;
  }
  // a highlighter's stroke with its colour taken off goes back to yellow, the colour it is made in
  if ('colour' in set && !patch.style && item.kind === 'Ink' && item.more.pen === 'highlighter') patch.style = 'yellow';
  return { ...patch, more };
}

/** The look the items share: each part all of them have alike, and nothing for a part in which they differ. */
export function sharedFormat(items: readonly BoardItem[]): Partial<Format> {
  const [first, ...rest] = items.map(formatOf);
  if (!first) return {};
  const shared: Partial<Format> = {};
  const alike = <K extends keyof Format>(key: K) => rest.every((f) => f[key] === first[key]);
  if (alike('colour')) shared.colour = first.colour;
  if (alike('line')) shared.line = first.line;
  if (alike('size')) shared.size = first.size;
  if (alike('bold')) shared.bold = first.bold;
  return shared;
}
