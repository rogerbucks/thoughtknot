// What the floating controls cover of the drawing (editor spec §25, controls_uncover). Roger, 1 Nov 2026: the controls
// lie over the drawing and never shrink it. So a thing chosen must never hide behind them. Each card over the drawing
// covers a strip from the edge it is nearest. The chip and docks sit in the top start corner. The phone's sheet sits
// at the foot, and the mini-map in the bottom end corner. The selection glides into the part they leave clear, as it
// does for the details (sheet_keeps_thing_clear).
import type { Clear } from '@thoughtknot/core';

/** A rectangle on the screen, as an element's bounding box gives it. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The cards that float over the drawing and may cover a thing chosen. */
const CARDS = ['.thoughtknot-corner', '.thoughtknot-dock.is-free', '.thoughtknot-phone-sheet', '.thoughtknot-mini-map'];

/**
 * How much of `view` the `cards` cover at each edge. A card covers a strip from the edge that needs the thinnest strip
 * to clear it. A card outside the view, or of no size, covers nothing.
 */
export function coverByCards(view: ScreenBox, cards: readonly ScreenBox[]): Clear {
  const clear: Clear = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const c of cards) {
    if (c.right <= view.left || c.left >= view.right || c.bottom <= view.top || c.top >= view.bottom) continue;
    if (c.right - c.left <= 0 || c.bottom - c.top <= 0) continue;
    const strips: [keyof Clear, number][] = [
      ['left', c.right - view.left],
      ['right', view.right - c.left],
      ['top', c.bottom - view.top],
      ['bottom', view.bottom - c.top],
    ];
    const [edge, strip] = strips.reduce((a, b) => (b[1] < a[1] ? b : a));
    clear[edge] = Math.max(clear[edge], strip);
  }
  return clear;
}

/** How much of the drawing's `viewport` (on the screen at `view`) the cards floating over it cover at each edge. */
export function overCover(viewport: HTMLElement, view: ScreenBox): Clear {
  const card = viewport.parentElement;
  if (!card) return { top: 0, right: 0, bottom: 0, left: 0 };
  const shown = CARDS.flatMap((sel) => Array.from(card.querySelectorAll<HTMLElement>(sel))).filter(
    (el) => !el.hidden && !el.closest('[hidden]'),
  );
  return coverByCards(
    view,
    shown.map((el) => el.getBoundingClientRect()),
  );
}

/** The larger of two covers at each edge. */
export const widest = (a: Clear, b: Clear): Clear => ({
  top: Math.max(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
  left: Math.max(a.left, b.left),
});
