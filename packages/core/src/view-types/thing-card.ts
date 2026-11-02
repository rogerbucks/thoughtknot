// A thing drawn as a rounded card with its name inside, not as a dot named beside it (Roger, 2 Nov 2026: "rounded
// rectangles / defined shapes for nodes rather than circles"). So a name always plainly belongs to its thing.
// - The cards of a view are one height, chosen so all of them take a set share of the space.
// - Each card is as wide as its whole name. Only a very long name is cut, with an ellipsis; the box keeps it whole.
// - Cards that would cover one another are moved apart, a little at a time, so the layout keeps its shape. The same
//   graph gives the same places each time, so nothing jumps.
// Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import { LETTER, fitText } from './fit-text.ts';
import { NAME_MOST } from './type-scale.ts';

/** A card's name, as a share of its height. */
const WORDS_SHARE = 0.48;
/** The room each side of a card's name, as a share of its height. */
const PAD_SHARE = 0.4;
/** How many times its height a card may be wide, at most. */
const WIDE_MOST = 12;
/** The tallest a card is, in the drawing's units: its name is then the largest a name may be (type-scale.ts). */
const TALL_MOST = NAME_MOST / WORDS_SHARE;
/** The share of the space all the cards take together. */
const FILL = 0.18;
/** The room kept between cards, as a share of their height. */
const GAP_SHARE = 0.3;
/** How many rounds of moving cards apart. */
const ROUNDS = 80;

/** How wide a card `tall` high is for `text`. */
export const cardWidth = (text: string, tall: number): number =>
  Math.max(
    tall * 1.6,
    Math.min(tall * WIDE_MOST, [...text].length * LETTER * WORDS_SHARE * tall + 2 * PAD_SHARE * tall),
  );

/** The height of the cards for `texts`, so together they take FILL of a space of `area`. */
export function cardTall(texts: readonly string[], area: number): number {
  const across = texts.reduce((s, t) => s + cardWidth(t, 1), 0);
  return Math.min(TALL_MOST, Math.sqrt((FILL * area) / Math.max(across, 1e-9)));
}

/**
 * The centres of cards `widths` wide and `tall` high at `at`, moved apart where they would cover one another. They
 * are kept inside a `width` by `height` space. A pair is pushed apart the shorter way, each half the overlap.
 */
export function spreadCards(
  at: readonly (readonly [number, number])[],
  widths: readonly number[],
  tall: number,
  width: number,
  height: number,
): [number, number][] {
  const p = at.map(([x, y]) => [x, y] as [number, number]);
  const gap = tall * GAP_SHARE;
  const keep = () =>
    p.forEach((c, i) => {
      const half = Math.min((widths[i] ?? 0) / 2, width / 2);
      c[0] = Math.min(Math.max(c[0], half), width - half);
      c[1] = Math.min(Math.max(c[1], tall / 2), height - tall / 2);
    });
  keep();
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i] as [number, number],
          b = p[j] as [number, number];
        const ox = ((widths[i] ?? 0) + (widths[j] ?? 0)) / 2 + gap - Math.abs(a[0] - b[0]),
          oy = tall + gap - Math.abs(a[1] - b[1]);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // the shorter way; two in one place part the same way each time
        if (oy <= ox) {
          const s = (a[1] <= b[1] ? -1 : 1) * (oy / 2);
          a[1] += s;
          b[1] -= s;
        } else {
          const s = (a[0] <= b[0] ? -1 : 1) * (ox / 2);
          a[0] += s;
          b[0] -= s;
        }
      }
    keep();
    if (!moved) break;
  }
  return p;
}

/** Thing `key`, named `text`, as a rounded card `width` by `tall` centred at (`x`, `y`) in `style`, named inside. */
export function thingCard(
  key: string,
  text: string,
  x: number,
  y: number,
  width: number,
  tall: number,
  style: string,
): DrawMark[] {
  const words = tall * WORDS_SHARE,
    room = Math.max(width - 2 * PAD_SHARE * tall, 1);
  return [
    {
      kind: 'box',
      id: key,
      of: key,
      style,
      x: x - width / 2,
      y: y - tall / 2,
      width,
      height: tall,
      shape: 'round',
      solid: true,
      role: 'thing',
      name: text,
    },
    {
      kind: 'label',
      id: `${key}\nlabel`,
      of: key,
      style: 'text',
      x,
      y: y + words * 0.35,
      text: fitText(text, room, words),
      size: words,
      anchor: 'middle',
      maxWidth: room,
    },
  ];
}
