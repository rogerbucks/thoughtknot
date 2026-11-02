// Names readable at any zoom in 2D (Zen-led refresh step 1b; Roger chose it on 2 Nov 2026). A 2D drawing's words
// shrank with it, so a big graph fitted to a small card showed names of 4 to 6 pixels. 3D already keeps its names
// readable (space-labels.ts), and now 2D does too, the same way:
// - a name never shows under READABLE_LEAST pixels on the screen: drawn smaller than that, it is drawn larger;
// - a name beside its thing, as a map's, never shows over READABLE_MOST: zooming in spreads the things, not the names;
// - a name drawn larger would cover another, so the one placed first keeps its place and the other is left out;
// - first placed are the picked thing's and those in focus, then the largest, then the rest in drawing order.
// - a name grown past the edge of the view is nudged back in, so it is not cut off and stays in reach.
// Zooming in shows more names, as each needs less room. A name grows about its own middle. Host-free.
import { LETTER } from './fit-text.ts';

/** The least and most size a name beside its thing shows at on the screen, in pixels: the type scale's (type-scale.ts). A
 * name inside its box grows with the box as you zoom in, so it has no most. */
export const READABLE_LEAST = 9,
  READABLE_MOST = 12;
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
  /** Set on a name inside its thing's box, which grows with the box; else it is beside its thing, as a map's names. */
  inside?: boolean;
}

/** How a word shows at this zoom: its size and place in the drawing's units, or left out. */
export interface Shown {
  size: number;
  x: number;
  y: number;
  hidden: boolean;
}

/** A box on the screen, in the drawing's units. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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
 * before the rest, in their order. A name grown past the edge of `view`, the part of the drawing shown, is nudged back
 * inside it. Gives back one Shown for each word, in the same order.
 */
export function readableWords(words: readonly Word[], k: number, first: readonly string[] = [], view?: Box): Shown[] {
  const groups = new Map<string, number[]>();
  words.forEach((w, i) => groups.set(w.group, [...(groups.get(w.group) ?? []), i]));
  const out: Shown[] = words.map((w) => ({ size: w.size, x: w.x, y: w.y, hidden: false }));
  if (!(k > 0)) return out;
  const least = READABLE_LEAST / k,
    most = READABLE_MOST / k,
    gap = GAP / k;
  // each group grows by one factor about its middle, so its rows keep their spacing and none covers another
  const placed: { group: string; box: Box; most: number }[] = [];
  for (const [group, at] of groups) {
    const own = at.map((i) => words[i] as Word);
    // a name beside its thing keeps to the most as you zoom in, so the room between names grows and more show
    const shrink = own.some((w) => w.inside) ? 1 : Math.min(1, ...own.map((w) => most / w.size));
    const grow = Math.max(shrink, ...own.map((w) => least / w.size));
    const cx = own.reduce((s, w) => s + w.x, 0) / own.length,
      cy = own.reduce((s, w) => s + w.y, 0) / own.length;
    let box: Box | null = null;
    for (const i of at) {
      const w = words[i] as Word,
        shown = out[i] as Shown;
      shown.size = w.size * grow;
      shown.x = cx + (w.x - cx) * grow;
      shown.y = cy + (w.y - cy) * grow;
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
    placed.push({ group, box, most: Math.max(...own.map((w) => w.size)) });
  }
  const rank = new Map(first.map((g, i) => [g, i]));
  const order = placed
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => (rank.get(a.group) ?? Infinity) - (rank.get(b.group) ?? Infinity) || b.most - a.most || a.i - b.i);
  // the names kept so far, by the cells of a grid they touch, so each new one is checked only against its neighbours
  const cell = CELL / k,
    grid = new Map<string, Box[]>();
  const cells = (b: Box): string[] => {
    const keys: string[] = [];
    for (let cx = Math.floor((b.left - gap) / cell); cx <= Math.floor((b.right + gap) / cell); cx++)
      for (let cy = Math.floor((b.top - gap) / cell); cy <= Math.floor((b.bottom + gap) / cell); cy++)
        keys.push(`${cx},${cy}`);
    return keys;
  };
  for (const p of order) {
    const near = cells(p.box);
    if (near.some((c) => grid.get(c)?.some((b) => overlaps(b, p.box, gap))))
      for (const i of groups.get(p.group) ?? []) (out[i] as Shown).hidden = true;
    else for (const c of near) grid.set(c, [...(grid.get(c) ?? []), p.box]);
  }
  return out;
}
