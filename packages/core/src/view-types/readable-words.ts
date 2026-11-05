// Names that stay legible in 2D at any zoom, the busiest shown first (Roger, 2 and 5 Nov 2026):
// - a name beside its thing is never drawn under NAME_SHOWN pixels on the screen, so zooming out never shrinks it past
//   reading. Past NAME_CEILING pixels it stops growing as you zoom in. A name inside its thing's box keeps its size so
//   it fits, and is left out under SHOWN_LEAST pixels;
// - a name left out for want of room is not lost: the name that covers its place counts it, as "+3" (`more`);
// - a name beside its thing grows with the thing's links, up to HUB_LARGER times, so the busiest read from far out;
// - a name that would cover another is left out. The picked thing's and those in focus are placed first. Then come
//   the things with the most links, then the largest, then the rest in drawing order;
// - a name past the edge of the view is nudged back in, so it is not cut off and stays in reach.
// Zooming in shows more names, as more grow large enough and the room between them grows. Host-free.
import { LETTER } from './fit-text.ts';
import { NAME_CEILING } from './type-scale.ts';

/** The least size a name is shown at on the screen, in pixels, when labels too small to read are hidden. */
export const SHOWN_LEAST = 6;
/** The least size a name beside its thing is drawn at on the screen, in pixels: zoomed out it holds this size. */
export const NAME_SHOWN = 12;
/** The least thickness a link is drawn at on the screen, in pixels, so zoomed out it never thins to nothing. */
export const LINK_LEAST = 1.5;
/** How much larger the name beside the busiest thing is drawn than one beside a thing with no links. */
export const HUB_LARGER = 1.4;
/** How tall a row of words is, as a share of their size. */
const ROW = 1.2;
/** The room kept round each name, in pixels of the screen. */
const GAP = 2;
/** The size of each cell of the grid that finds names that would overlap, in pixels of the screen. */
const CELL = 64;

/** A word as drawn, in the drawing's own units: one row of a thing's name. Words of one `group` grow together. */
export interface Word {
  group: string;
  x: number;
  y: number;
  size: number;
  anchor: 'start' | 'middle' | 'end';
  letters: number;
  /** Set on a name inside its thing's box, which keeps its size so it fits; else it is beside its thing, as a map's. */
  inside?: boolean;
}

/** How a word shows at this zoom: its size and place in the drawing's units, or left out. */
export interface Shown {
  size: number;
  x: number;
  y: number;
  hidden: boolean;
  /** On the first word of a name that shown, how many names left out for want of room it stands for: "+3". */
  more?: number;
  /** Where its count goes, beside the name's end on its baseline, and the size to draw it at. */
  moreAt?: { x: number; y: number; size: number };
}

/** A box on the screen, in the drawing's units. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The thickness to draw links at, in the drawing's units, when one unit is `k` pixels on the screen: never thinner. */
export const linkLeast = (k: number): number => (k > 0 ? LINK_LEAST / k : 0);

/** The box a word takes, drawn at `size` with its anchor at (`x`, `y`) on its baseline. */
function boxOf(w: Word, x: number, y: number, size: number): Box {
  const width = w.letters * LETTER * size,
    left = w.anchor === 'start' ? x : w.anchor === 'end' ? x - width : x - width / 2;
  return { left, top: y - size, right: left + width, bottom: y - size + size * ROW };
}

const overlaps = (a: Box, b: Box, gap: number): boolean =>
  a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

/** How far to move one way to bring `from`, to `to`, inside `[lo, hi]`: none when it is already in, or cannot fit. */
const into = (from: number, to: number, lo: number, hi: number): number =>
  to - from > hi - lo ? 0 : from < lo ? lo - from : to > hi ? hi - to : 0;

/** How far to move `box` to bring it inside `view`: none for a box wholly out of view, as its thing is. */
function inward(box: Box, view: Box): [number, number] {
  if (!overlaps(box, view, 0)) return [0, 0];
  return [into(box.left, box.right, view.left, view.right), into(box.top, box.bottom, view.top, view.bottom)];
}

/**
 * How each of `words` shows when one unit of the drawing is `k` pixels on the screen. The groups in `first` are placed
 * before the rest, in their order; then those with the most `links`, a count by group. A name past the edge of `view`,
 * the part of the drawing shown, is nudged back inside it. With `hideSmall`, a name too small to read is left out.
 * Gives back one Shown for each word, in the same order.
 */
export function readableWords(
  words: readonly Word[],
  k: number,
  first: readonly string[] = [],
  view?: Box,
  links: ReadonlyMap<string, number> = new Map(),
  hideSmall = false,
): Shown[] {
  const groups = new Map<string, number[]>();
  words.forEach((w, i) => groups.set(w.group, [...(groups.get(w.group) ?? []), i]));
  const out: Shown[] = words.map((w) => ({ size: w.size, x: w.x, y: w.y, hidden: false }));
  if (!(k > 0)) return out;
  const gap = GAP / k,
    busiest = Math.max(1, ...links.values());
  // each group grows by one factor about its middle, so its rows keep their spacing and none covers another
  const placed: { group: string; box: Box; most: number; links: number }[] = [];
  for (const [group, at] of groups) {
    const own = at.map((i) => words[i] as Word);
    const many = links.get(group) ?? 0;
    // a name beside a busy thing is drawn larger; one inside its box keeps its size, so it still fits
    const hub = own.some((w) => w.inside) ? 1 : 1 + (HUB_LARGER - 1) * Math.sqrt(many / busiest);
    // held at NAME_SHOWN when zoomed out and at NAME_CEILING when zoomed in; a name inside its box only at the ceiling
    const inside = own.some((w) => w.inside),
      tall = Math.max(...own.map((w) => w.size)) * k,
      onScreen = Math.min(NAME_CEILING, Math.max(inside ? 0 : NAME_SHOWN, tall)),
      grow = tall > 0 ? hub * (onScreen / tall) : hub;
    const cx = own.reduce((s, w) => s + w.x, 0) / own.length,
      cy = own.reduce((s, w) => s + w.y, 0) / own.length;
    let box: Box | null = null;
    for (const i of at) {
      const w = words[i] as Word,
        shown = out[i] as Shown;
      shown.size = w.size * grow;
      shown.x = cx + (w.x - cx) * grow;
      // a name drawn larger than it was grows down from the top of its first row, so it still clears its thing
      shown.y = cy + (w.y - cy) * grow + (grow > 1 && !inside ? (grow - 1) * 0.8 * w.size : 0);
      const b = boxOf(w, shown.x, shown.y, shown.size);
      box = box
        ? {
            left: Math.min(box.left, b.left),
            top: Math.min(box.top, b.top),
            right: Math.max(box.right, b.right),
            bottom: Math.max(box.bottom, b.bottom),
          }
        : b;
    }
    if (!box) continue;
    const [dx, dy] = view ? inward(box, view) : [0, 0];
    if (dx || dy) {
      for (const i of at) {
        (out[i] as Shown).x += dx;
        (out[i] as Shown).y += dy;
      }
      box = { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
    }
    const most = Math.max(...own.map((w) => w.size * grow));
    // too small to read: left out, and it takes no room. A name beside its thing is never drawn so small
    if ((hideSmall || inside) && most * k < SHOWN_LEAST) for (const i of at) (out[i] as Shown).hidden = true;
    else placed.push({ group, box, most, links: many });
  }
  const rank = new Map(first.map((g, i) => [g, i]));
  const order = placed
    .map((p, i) => ({ ...p, i }))
    .sort(
      (a, b) =>
        (rank.get(a.group) ?? Infinity) - (rank.get(b.group) ?? Infinity) ||
        b.links - a.links ||
        b.most - a.most ||
        a.i - b.i,
    );
  // the names kept so far, by the cells of a grid they touch, so each new one is checked only against its neighbours
  const cell = CELL / k,
    grid = new Map<string, { box: Box; group: string }[]>(),
    merged = new Map<string, number>();
  const cells = (b: Box): string[] => {
    const keys: string[] = [];
    for (let cx = Math.floor((b.left - gap) / cell); cx <= Math.floor((b.right + gap) / cell); cx++)
      for (let cy = Math.floor((b.top - gap) / cell); cy <= Math.floor((b.bottom + gap) / cell); cy++)
        keys.push(`${cx},${cy}`);
    return keys;
  };
  for (const p of order) {
    const near = cells(p.box),
      under = near.flatMap((c) => grid.get(c) ?? []).find((o) => overlaps(o.box, p.box, gap));
    if (under) {
      for (const i of groups.get(p.group) ?? []) (out[i] as Shown).hidden = true;
      merged.set(under.group, (merged.get(under.group) ?? 0) + 1);
    } else for (const c of near) grid.set(c, [...(grid.get(c) ?? []), { box: p.box, group: p.group }]);
  }
  // the name that stands, with the count of those it covers, drawn at its end
  for (const [group, count] of merged) {
    const first = (groups.get(group) ?? [])[0] as number,
      at = placed.find((p) => p.group === group);
    if (at) (out[first] as Shown).more = count;
    if (at)
      (out[first] as Shown).moreAt = { x: at.box.right + gap * 2, y: (out[first] as Shown).y, size: at.most * 0.85 };
  }
  return out;
}
