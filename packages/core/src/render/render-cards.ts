// Things drawn as whole cards, each showing all of its note: part of layers L2 and L4 (wiki/Rendering-spec.md;
// ES§73, render_cards). Roger, 13 Nov 2026: "cards show all the notes and the diagram layouts show the whole cards
// with arrows in the right place".
// - A card is one width. Its height fits its name, its note, the note it stands for and a few properties. It shows up
//   to CARD_MOST_LINES lines of text. The rest waits behind "Show all", which opens the card in place.
// - Each layout keeps its own places, spread out only as far as the cards need. Cards still covering one another are
//   then moved apart a little at a time. The same graph gives the same places, so nothing jumps.
// - An arrow leaves and reaches a card at its edge, never its middle, and goes round every other card in its way.
//   Arrows on one side keep apart where they can.
// Host-free and pure.
import { elbowRoute, type Taken } from '../layouts/elbow-route.ts';
import { textWidth, wrapName } from './render-labels.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene } from './render-scene.ts';

/** A card's width, in the drawing's pixels at full size. */
export const CARD_W = 240;
/** The height of a card's header, which holds its name and kind. */
export const CARD_HEAD = 30;
/** The room inside a card's edge, round its text. */
export const CARD_PAD = 10;
/** The size of a card's text. */
export const CARD_PX = 12;
/** The height of each line of a card's text. */
export const CARD_LINE = 18;
/** The most lines of note a card shows before "Show all" (coordinator, 13 Nov 2026: about 12). */
export const CARD_MOST_LINES = 12;
/** The most properties a card shows, one to a line. */
export const CARD_PROPS = 3;
/** The room kept between two cards, in pixels. */
export const CARD_GAP = 28;
/** How far a layout's places may be spread out at most; past it, cards are moved apart one by one. */
const SPREAD_MOST = 8;
/** How many rounds of moving cards apart. */
const ROUNDS = 120;

/** What a card shows: its thing's key, name and kind, its own note, the body of the note it stands for, its properties. */
export interface CardText {
  key: string;
  name: string;
  kind?: string;
  /** The note written above the thing (`///` lines), as Markdown. */
  note?: string;
  /** The body of the note the thing is, or links to, as Markdown; shown below its own note. */
  linked?: string;
  props?: readonly (readonly [string, string])[];
}

/** How a card is drawn: its size, the lines of text it shows, and how many more wait behind "Show all". */
export interface CardSize {
  w: number;
  h: number;
  shown: number;
  more: number;
}

/** A card where it is drawn: its key, its middle and its size. */
export interface CardBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An arrow from card to card: the corners it runs through, from the edge of one to the edge of the other. */
export interface CardArrow {
  from: string;
  to: string;
  way: [number, number][];
}

/** The letters on one line of a card's text. */
const LETTERS = Math.floor((CARD_W - 2 * CARD_PAD) / textWidth('m', CARD_PX));

/** How many lines `markdown` takes on a card, each paragraph on its lines and a blank line as half of one. */
export function linesOf(markdown: string): number {
  let lines = 0;
  for (const para of markdown.split('\n')) {
    const text = para.replace(/[*_`#>]/g, '').trim();
    lines += text ? wrapName(text, LETTERS, Number.MAX_SAFE_INTEGER).length : 0.5;
  }
  return Math.ceil(lines);
}

/** The size of the card for `c`: its whole text up to CARD_MOST_LINES lines, and how many lines are left over. */
export function cardSizeOf(c: CardText): CardSize {
  const text = [c.note, c.linked].filter((t): t is string => !!t && !!t.trim());
  const all = text.reduce((n, t) => n + linesOf(t), 0);
  const shown = Math.min(all, CARD_MOST_LINES);
  const more = all - shown;
  const props = Math.min(c.props?.length ?? 0, CARD_PROPS);
  const body = shown + props + (more ? 1 : 0);
  return { w: CARD_W, h: CARD_HEAD + (body ? 2 * CARD_PAD + body * CARD_LINE : 0), shown, more };
}

const byKey = (a: CardBox, b: CardBox) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** How far apart two cards still cover one another, across and down; at or below 0 either way, they do not. */
const overlap = (a: CardBox, b: CardBox): [number, number] => [
  (a.w + b.w) / 2 + CARD_GAP - Math.abs(a.x - b.x),
  (a.h + b.h) / 2 + CARD_GAP - Math.abs(a.y - b.y),
];

/** The spread that would part two cards the easier way: 1 if they are apart already, Infinity if in one place. */
function partedAt(a: CardBox, b: CardBox): number {
  const [dx, dy] = [Math.abs(a.x - b.x), Math.abs(a.y - b.y)];
  const across = dx ? ((a.w + b.w) / 2 + CARD_GAP) / dx : Infinity;
  const down = dy ? ((a.h + b.h) / 2 + CARD_GAP) / dy : Infinity;
  return Math.max(1, Math.min(across, down));
}

/**
 * How far a layout of the cards `boxes` is spread from its middle (`cx`, `cy`). It is as far as the middle card of them
 * needs to stand clear of its nearest neighbour. It is at most SPREAD_MOST, and never less than 1. Spreading the whole
 * layout so keeps its shape.
 */
export function spreadOf(boxes: readonly CardBox[]): { spread: number; cx: number; cy: number } {
  const n = boxes.length || 1;
  const cx = boxes.reduce((s, b) => s + b.x, 0) / n,
    cy = boxes.reduce((s, b) => s + b.y, 0) / n;
  const needs = boxes
    .map((a, i) => Math.min(...boxes.filter((_, j) => j !== i).map((b) => partedAt(a, b))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const spread = Math.min(SPREAD_MOST, needs.length ? (needs[Math.floor(needs.length / 2)] as number) : 1);
  return { spread, cx, cy };
}

/**
 * The cards `boxes`, each centred at its layout's place, spread out so that none covers another. First the whole
 * layout is spread from its middle (`spreadOf`). Then any cards still covering one another are pushed apart the
 * shorter way, each half the overlap. The same boxes always give the same places, whatever order they come in.
 */
export function spreadCardBoxes(boxes: readonly CardBox[]): CardBox[] {
  const p = [...boxes].sort(byKey).map((b) => ({ ...b }));
  if (p.length < 2) return p;
  const { spread, cx, cy } = spreadOf(p);
  for (const b of p) [b.x, b.y] = [cx + (b.x - cx) * spread, cy + (b.y - cy) * spread];
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i] as CardBox,
          b = p[j] as CardBox;
        const [ox, oy] = overlap(a, b);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // the shorter way; two in one place part down, the first above, the same each time
        if (oy <= ox) {
          const s = (a.y <= b.y ? -1 : 1) * (oy / 2 + 0.01);
          a.y += s;
          b.y -= s;
        } else {
          const s = (a.x <= b.x ? -1 : 1) * (ox / 2 + 0.01);
          a.x += s;
          b.x -= s;
        }
      }
    if (!moved) break;
  }
  return p;
}

/**
 * The arrows of `links` between the cards `boxes`. Each runs across and down, from edge to edge of its two cards. It
 * goes round every other card, and keeps off the arrows found before it. `axis` is the layout's way (0
 * across, 1 down): an arrow leaves and reaches its cards that way where it can. A link to itself, or to a thing with
 * no card, has none.
 */
export function cardArrows(
  boxes: readonly CardBox[],
  links: readonly { from: string; to: string }[],
  axis: 0 | 1 = 1,
): CardArrow[] {
  const placed = boxes.map((b) => ({ key: b.key, x: b.x, y: b.y, hw: b.w / 2, hh: b.h / 2 }));
  const at = new Map(placed.map((b) => [b.key, b]));
  const taken: Taken = new Map();
  const out: CardArrow[] = [];
  for (const l of links) {
    const a = at.get(l.from),
      b = at.get(l.to);
    if (!a || !b || a === b) continue;
    out.push({ from: l.from, to: l.to, way: elbowRoute(a, b, placed, axis, taken) });
  }
  return out;
}

/** The items of `scene`: the nodes at its last depth, each holding only itself. */
export const itemsOf = (scene: Scene): string[] =>
  [...scene.nodes.values()]
    .filter((n) => !n.children.length && n.items.length === 1 && n.items[0] === n.key)
    .map((n) => n.key);

/** A layout drawn as cards: every place spread for them, each item's card, and the arrows between cards. */
export interface CardsLaid {
  spots: Map<string, Spot>;
  cards: (CardBox & CardSize & { text: CardText })[];
  arrows: CardArrow[];
  /** How far every place was spread, from where. */
  spread: number;
  cx: number;
  cy: number;
}

/**
 * The layout `spots` of `scene` drawn as the cards of `texts`, with arrows for `links`. Every place, groups too, is
 * spread from the layout's middle as far as the cards need, so groups still hold their items. Then cards still covering
 * one another are pushed apart. An item with no text gets a card of its name.
 */
export function cardsLaid(
  scene: Scene,
  spots: ReadonlyMap<string, Spot>,
  texts: ReadonlyMap<string, CardText>,
  links: readonly { from: string; to: string }[],
  axis: 0 | 1 = 1,
): CardsLaid {
  const items = itemsOf(scene).filter((k) => spots.has(k));
  const text = (k: string): CardText => texts.get(k) ?? { key: k, name: scene.nodes.get(k)?.name ?? k };
  const sized = new Map(items.map((k) => [k, cardSizeOf(text(k))]));
  const boxes = items.map((k) => {
    const s = spots.get(k) as Spot,
      z = sized.get(k) as CardSize;
    return { key: k, x: s.x, y: s.y, w: z.w, h: z.h };
  });
  const { spread, cx, cy } = spreadOf(boxes);
  const out = new Map<string, Spot>();
  for (const [k, s] of spots) out.set(k, { x: cx + (s.x - cx) * spread, y: cy + (s.y - cy) * spread, r: s.r * spread });
  const placed = spreadCardBoxes(boxes);
  // an item's spot reaches round its whole card, so a fit shows every card whole
  for (const b of placed) out.set(b.key, { x: b.x, y: b.y, r: Math.max(b.w, b.h) / 2 });
  const cards = placed.map((b) => ({ ...(sized.get(b.key) as CardSize), ...b, text: text(b.key) }));
  return { spots: out, cards, arrows: cardArrows(placed, links, axis), spread, cx, cy };
}

/** Whether the straight piece from `p` to `q` runs through the inside of `box`, kept in from its edge by `inset`. */
export function cutsThrough(p: [number, number], q: [number, number], box: CardBox, inset = 1): boolean {
  const [x0, x1] = [box.x - box.w / 2 + inset, box.x + box.w / 2 - inset];
  const [y0, y1] = [box.y - box.h / 2 + inset, box.y + box.h / 2 - inset];
  // the piece clipped to the box's band across, then down (Liang–Barsky)
  let [t0, t1] = [0, 1];
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  for (const [d, lo, hi, s] of [
    [dx, x0, x1, p[0]],
    [dy, y0, y1, p[1]],
  ] as const) {
    if (d === 0) {
      if (s <= lo || s >= hi) return false;
      continue;
    }
    const [a, b] = [(lo - s) / d, (hi - s) / d];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 >= t1) return false;
  }
  return true;
}

/** Whether `p` lies on the edge of `box`, within `near` pixels. */
export function onEdge(p: [number, number], box: CardBox, near = 0.5): boolean {
  const [hx, hy] = [box.w / 2, box.h / 2];
  const [dx, dy] = [Math.abs(p[0] - box.x), Math.abs(p[1] - box.y)];
  const inside = dx <= hx + near && dy <= hy + near;
  return inside && (Math.abs(dx - hx) <= near || Math.abs(dy - hy) <= near);
}
