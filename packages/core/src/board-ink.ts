// Pen and highlighter strokes on a board (editor spec ES§45, board_ink). A stroke is an Ink item, as a drawing over a
// graph keeps it (sketch.ts): its points are one text of whole-number pairs, `points: '0 0 12 4'`, measured from the
// item's own corner, so moving the item moves the stroke. A highlighter is a wide, see-through stroke in yellow.
// Host-free: the host feeds in the points a pointer went through and gets back the item to write, or what to erase.
import type { BoardItem } from './board.ts';
import { thinned } from './sketch-edit.ts';

/** The two pens: the fine one, and the wide see-through one. */
export type Pen = 'pen' | 'highlighter';

/** How wide each pen draws, in board units. */
export const PEN_WIDTH: Record<Pen, number> = { pen: 3, highlighter: 14 };
/** How much of the colour a highlighter lets through. */
export const HIGHLIGHT_OPACITY = 0.45;
/** The room kept round a stroke inside its item's box, so its width is not cut off. */
const PAD = 8;

type Pair = [number, number];

/** Which pen made an Ink item. */
export const penOf = (item: BoardItem): Pen => (item.more.pen === 'highlighter' ? 'highlighter' : 'pen');

/** An Ink item's points, from its own corner; none when it holds none that can be read. */
export function inkPoints(item: BoardItem): Pair[] {
  const raw = item.more.points;
  if (typeof raw !== 'string') return [];
  const n = raw.trim().split(/\s+/).map(Number);
  if (n.length < 4 || n.length % 2 || n.some((v) => !Number.isFinite(v))) return [];
  const out: Pair[] = [];
  for (let i = 0; i < n.length; i += 2) out.push([n[i] as number, n[i + 1] as number]);
  return out;
}

/**
 * The Ink item a pointer's path makes, as `id`: the path thinned to the points that keep its shape, in whole numbers,
 * in a box that holds it. A single press makes a dot. Null when the path has no point.
 */
export function inkItem(id: string, pen: Pen, path: readonly Pair[]): BoardItem | null {
  const kept = thinned(path.map(([x, y]): Pair => [Math.round(x), Math.round(y)]));
  const first = kept[0];
  if (!first) return null;
  const all: Pair[] = kept.length > 1 ? kept : [first, first];
  const x0 = Math.min(...all.map((p) => p[0])) - PAD,
    y0 = Math.min(...all.map((p) => p[1])) - PAD;
  const w = Math.max(...all.map((p) => p[0])) + PAD - x0,
    h = Math.max(...all.map((p) => p[1])) + PAD - y0;
  const more: BoardItem['more'] = { points: all.map(([x, y]) => `${x - x0} ${y - y0}`).join(' ') };
  if (pen === 'highlighter') more.pen = 'highlighter';
  const item: BoardItem = { id, kind: 'Ink', x: x0, y: y0, w, h, more };
  if (pen === 'highlighter') item.style = 'yellow';
  return item;
}

/** A number as SVG writes it, to two places. */
const num = (v: number) => String(Math.round(v * 100) / 100);

/** The stroke drawn as one smooth path in `colour`, or null for an Ink item with no points to draw. */
export function inkSvg(item: BoardItem, colour: string): string | null {
  const pts = inkPoints(item).map(([x, y]): Pair => [item.x + x, item.y + y]);
  const [a, ...rest] = pts;
  if (!a) return null;
  let d = `M${num(a[0])} ${num(a[1])}`;
  if (rest.length === 1) d += `L${num((rest[0] as Pair)[0])} ${num((rest[0] as Pair)[1])}`;
  else
    rest.forEach((p, i) => {
      const next = rest[i + 1];
      // a curve through the middle of each pair of points, so a stroke runs smooth; the last point ends it
      d += next
        ? `Q${num(p[0])} ${num(p[1])} ${num((p[0] + next[0]) / 2)} ${num((p[1] + next[1]) / 2)}`
        : `L${num(p[0])} ${num(p[1])}`;
    });
  const pen = penOf(item);
  const see = pen === 'highlighter' ? ` stroke-opacity="${HIGHLIGHT_OPACITY}"` : '';
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${PEN_WIDTH[pen]}"${see} stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke"/>`;
}

/** Whether a spot `at` on the board lies within `reach` of the stroke of an Ink item (its width counts too). */
export function inkHit(item: BoardItem, at: Pair, reach: number): boolean {
  const pts = inkPoints(item).map(([x, y]): Pair => [item.x + x, item.y + y]);
  const r = reach + PEN_WIDTH[penOf(item)] / 2;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pair,
      b = pts[i + 1] ?? a;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / len)) : 0;
    if (Math.hypot(at[0] - (a[0] + t * dx), at[1] - (a[1] + t * dy)) <= r) return true;
  }
  return false;
}
