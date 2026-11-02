// A name cut to the room it has, so a view's words never spill over their box (design review, 1 Nov 2026).
// The SVG a card shows draws text at its full length, so a view cuts its own names.

/** A letter's width, as a share of its size: Helvetica's average. */
export const LETTER = 0.56;

/** `text` cut to fit `room` at `size`, with an ellipsis where it was cut. */
export function fitText(text: string, room: number, size: number): string {
  const most = Math.floor(room / (size * LETTER) + 1e-9);
  const letters = [...text];
  return letters.length <= most ? text : `${letters.slice(0, Math.max(most - 1, 0)).join('')}…`;
}
