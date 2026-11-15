// The boards of a note as pictures (editor spec ES§45, board_exchange). Each board is drawn whole as an SVG, in fixed
// colours, so it looks the same wherever it is opened. The host writes the SVG as it is, or draws it as a PNG or
// as a page of a PDF (board-pdf.ts). Host-free: the note is never written.
import { gqlSpans } from './blocks.ts';
import { boardOf, readBoard } from './board.ts';
import { boardFrame, boardSvg } from './board-svg.ts';
import { PALETTES } from './palette.ts';

/** The picture formats a board is exported as. */
export const BOARD_PICTURE_FORMATS = ['svg', 'png', 'pdf'] as const;
/** One picture format. */
export type BoardPictureFormat = (typeof BOARD_PICTURE_FORMATS)[number];

/** One board drawn whole: its name, its SVG, and its natural size in CSS pixels. */
export interface BoardPicture {
  name: string;
  svg: string;
  width: number;
  height: number;
}

/** Each board of the note drawn whole, in the fixed colours of `theme`, in the order the note holds them. */
export function boardPicturesOf(note: string, theme: 'light' | 'dark'): BoardPicture[] {
  return gqlSpans(note).flatMap((span) => {
    if (!boardOf(span.text)) return [];
    const { board } = readBoard(span.text);
    const frame = boardFrame(board);
    return [{ name: board.name, svg: boardSvg(board, PALETTES[theme]), width: frame.w, height: frame.h }];
  });
}

/**
 * The size in whole pixels a picture `width` by `height` is drawn at. It is twice its natural size, so its words
 * stay sharp. It is less when that would hold more than `most` pixels, and never under one pixel a side.
 */
export function pictureSize(width: number, height: number, most: number): { width: number; height: number } {
  const scale = Math.min(2, Math.sqrt(most / Math.max(1, width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
