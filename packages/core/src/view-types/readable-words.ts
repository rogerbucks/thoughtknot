// Names that scale with their things in 2D, the busiest shown first (Roger, 2 Nov 2026). A name keeps its size in the
// drawing, so it grows and shrinks with its thing as you zoom, as a map's names do:
// - a name is never blown up; with "Hide labels too small to read" on, one under SHOWN_LEAST pixels is left out;
// - a name beside its thing grows with the thing's links, up to HUB_LARGER times, so the busiest read from far out.
//   It grows away from its thing, from the edge nearest it, so it stays touching its thing and never covers it;
// - a name with no room where it was drawn moves to touch its thing below, above, right or left, the first with room.
// - a name that would cover another is left out. So is one on a thing with as many links as its own, so each name
//   plainly belongs to one thing. A busier thing's name may lie over a quieter thing drawn before it, so the name
//   is painted over that thing and still reads. The picked thing's and
//   those in focus are placed first. Then come the things with the most links, then the largest, then the rest in
//   drawing order;
// - a name past the edge of the view is nudged back in, so it is not cut off and stays in reach.
// Zooming in shows more names, as more grow large enough and the room between them grows. Host-free.
import { LETTER } from './fit-text.ts';

/** The least size a name is shown at on the screen, in pixels, when labels too small to read are hidden. */
export const SHOWN_LEAST = 6;
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

/** Where on `box` a name beside its thing grows from: its point nearest the middle of `thing`. */
function anchorOf(box: Box, thing: Box): [number, number] {
  const x = (thing.left + thing.right) / 2,
    y = (thing.top + thing.bottom) / 2;
  return [Math.min(Math.max(x, box.left), box.right), Math.min(Math.max(y, box.top), box.bottom)];
}

/** `box`, a name's, moved to touch `thing` below, above, right and left of it, as far from it as it was drawn. */
function besides(box: Box, thing: Box): Box[] {
  const d = Math.max(0, box.top - thing.bottom, thing.top - box.bottom, box.left - thing.right, thing.left - box.right);
  const w = box.right - box.left,
    h = box.bottom - box.top,
    mx = (thing.left + thing.right) / 2 - w / 2,
    my = (thing.top + thing.bottom) / 2 - h / 2;
  const at = (left: number, top: number): Box => ({ left, top, right: left + w, bottom: top + h });
  return [at(mx, thing.bottom + d), at(mx, thing.top - d - h), at(thing.right + d, my), at(thing.left - d - w, my)];
}

/** The box round all of `boxes`. */
const around = (boxes: readonly Box[]): Box => ({
  left: Math.min(...boxes.map((b) => b.left)),
  top: Math.min(...boxes.map((b) => b.top)),
  right: Math.max(...boxes.map((b) => b.right)),
  bottom: Math.max(...boxes.map((b) => b.bottom)),
});

/**
 * How each of `words` shows when one unit of the drawing is `k` pixels on the screen. The groups in `first` are placed
 * before the rest, in their order; then those with the most `links`, a count by group. A name past the edge of `view`,
 * the part of the drawing shown, is nudged back inside it. With `hideSmall`, a name too small to read is left out.
 * `things` are the outlines of the things named, by group: a name grows away from its own, and never covers another.
 * Gives back one Shown for each word, in the same order.
 */
export function readableWords(
  words: readonly Word[],
  k: number,
  first: readonly string[] = [],
  view?: Box,
  links: ReadonlyMap<string, number> = new Map(),
  hideSmall = false,
  things: ReadonlyMap<string, Box> = new Map(),
): Shown[] {
  const groups = new Map<string, number[]>();
  words.forEach((w, i) => groups.set(w.group, [...(groups.get(w.group) ?? []), i]));
  const out: Shown[] = words.map((w) => ({ size: w.size, x: w.x, y: w.y, hidden: false }));
  if (!(k > 0)) return out;
  const gap = GAP / k,
    busiest = Math.max(1, ...links.values());
  // each group grows by one factor about the point nearest its thing, else its middle, so its rows keep their spacing
  const placed: { group: string; was: Box; boxes: Box[]; most: number; links: number }[] = [];
  for (const [group, at] of groups) {
    const own = at.map((i) => words[i] as Word);
    const many = links.get(group) ?? 0;
    // a name beside a busy thing is drawn larger; one inside its box keeps its size, so it still fits
    const grow = own.some((w) => w.inside) ? 1 : 1 + (HUB_LARGER - 1) * Math.sqrt(many / busiest);
    const thing = things.get(group);
    const [cx, cy] = thing
      ? anchorOf(around(own.map((w) => boxOf(w, w.x, w.y, w.size))), thing)
      : [own.reduce((s, w) => s + w.x, 0) / own.length, own.reduce((s, w) => s + w.y, 0) / own.length];
    const boxes: Box[] = [];
    for (const i of at) {
      const w = words[i] as Word,
        shown = out[i] as Shown;
      shown.size = w.size * grow;
      shown.x = cx + (w.x - cx) * grow;
      shown.y = cy + (w.y - cy) * grow;
      boxes.push(boxOf(w, shown.x, shown.y, shown.size));
    }
    if (!boxes.length) continue;
    const box = around(boxes);
    // where it may go: as drawn, else touching its thing below, above, right or left; each nudged inside the view
    const spots = (thing && !own.some((w) => w.inside) ? [box, ...besides(box, thing)] : [box]).map((b) => {
      const [dx, dy] = view ? inward(b, view) : [0, 0];
      return { left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy };
    });
    const most = Math.max(...own.map((w) => w.size * grow));
    // too small to read, when asked: left out, and it takes no room
    if (hideSmall && most * k < SHOWN_LEAST) for (const i of at) (out[i] as Shown).hidden = true;
    else placed.push({ group, was: box, boxes: spots, most, links: many });
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
  // the names kept so far and the things, by the cells of a grid they touch. So each new name is checked only against
  // its neighbours. A name may lie on its own thing, as one inside its box does, and on a quieter thing drawn before
  // its own, never another
  const drawn = new Map([...things.keys()].map((g, i) => [g, i]));
  const cell = CELL / k,
    grid = new Map<string, (Box & { of?: string; links?: number })[]>();
  const cells = (b: Box): string[] => {
    const keys: string[] = [];
    for (let cx = Math.floor((b.left - gap) / cell); cx <= Math.floor((b.right + gap) / cell); cx++)
      for (let cy = Math.floor((b.top - gap) / cell); cy <= Math.floor((b.bottom + gap) / cell); cy++)
        keys.push(`${cx},${cy}`);
    return keys;
  };
  for (const [of, b] of things)
    for (const c of cells(b)) grid.set(c, [...(grid.get(c) ?? []), { ...b, of, links: links.get(of) ?? 0 }]);
  const under = (of: string, p: (typeof order)[number], many: number): boolean =>
    many < p.links && (drawn.get(of) ?? Infinity) < (drawn.get(p.group) ?? -Infinity);
  const covers = (p: (typeof order)[number], box: Box, b: Box & { of?: string; links?: number }): boolean =>
    b.of === undefined
      ? overlaps(b, box, gap)
      : b.of !== p.group && !under(b.of, p, b.links ?? 0) && overlaps(b, box, 0);
  for (const p of order) {
    const at = groups.get(p.group) ?? [];
    const box = p.boxes.find((box) => !cells(box).some((c) => grid.get(c)?.some((b) => covers(p, box, b))));
    if (!box) for (const i of at) (out[i] as Shown).hidden = true;
    else {
      for (const c of cells(box)) grid.set(c, [...(grid.get(c) ?? []), box]);
      const was = p.was;
      for (const i of at) {
        (out[i] as Shown).x += box.left - was.left;
        (out[i] as Shown).y += box.top - was.top;
      }
    }
  }
  return out;
}
