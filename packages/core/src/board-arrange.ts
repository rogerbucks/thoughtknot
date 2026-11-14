// A board's linked items arranged as the graph is (editor spec ES§45, board_arranged_by_graph; B2).
// - Only on the person's ask, by a layout they pick, such as force or a layout a plug-in brought. Nothing moves by itself.
// - Only items that became a thing move, and only where they are not locked. Every other item stays where it is.
// - The arrangement keeps its middle where the moved items' middle was, so the board is not thrown across the page.
// - It gives back the text as it was, so one undo puts every item back, and where each item went, for a glide.
// Host-free and pure: the host writes the text and draws the glide.
import { gqlBlocks } from './blocks.ts';
import { moveItem, readBoard } from './board.ts';
import { readNote } from './drawing.ts';
import type { Layout } from './layouts/layouts.ts';
import type { GraphShape } from './types-shape.ts';
import { word } from './words.ts';

/** The least gap between two arranged items, in board units, so a note is not drawn over its neighbour. */
const GAP = 200;

/** Where one item goes: its place now, and the place it glides to. */
export interface Glide {
  id: string;
  from: [number, number];
  to: [number, number];
}

/** A board arranged: the note, the note as it was (one undo), and the glide of each item that moved. */
export interface Arranged {
  note: string;
  undo: string;
  glide: Glide[];
}

/**
 * The note with the board's linked items arranged by `layout` (2D), or why not, in words. Each item stands where the
 * thing it became is placed. The things' links are the graph's own, so a linked item follows its thing.
 */
export function arrangeBoard(
  note: string,
  board: string,
  layout: Layout<2>,
  shared: string[] = [],
): Arranged | { refused: string } {
  const texts = gqlBlocks(note).map((b) => b.text);
  const text = texts.find((t) => readBoard(t).board.name === board);
  if (text === undefined) return { refused: word('board.arrange.no-board', { board }) };
  const { on, items } = readBoard(text).board;
  const g = on ? readNote(texts, undefined, shared).world[on] : undefined;
  if (!on || !g) return { refused: word('board.arrange.free') };
  const linked = items.filter((i) => i.graph !== undefined && g.nodes.has(i.graph));
  if (!linked.length) return { refused: word('board.arrange.none') };
  const shape: GraphShape = {
    things: [...g.nodes.keys()].map((key) => ({ key, text: key, kinds: [] })),
    links: g.edges.map(([from, type, to]) => ({ from, type, to })),
  };
  const spots = layout.place(shape);
  const movable = linked.filter((i) => !i.locked && spots.has(i.graph ?? ''));
  if (!movable.length) return { refused: word('board.arrange.none') };
  const at: [number, number][] = movable.map((i) => spots.get(i.graph ?? '') ?? [0, 0]);
  let nearest = Infinity;
  for (let a = 0; a < at.length; a++)
    for (let b = a + 1; b < at.length; b++) {
      const p: [number, number] = at[a] ?? [0, 0];
      const q: [number, number] = at[b] ?? [0, 0];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d > 0) nearest = Math.min(nearest, d);
    }
  const scale = Number.isFinite(nearest) ? GAP / nearest : 1;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const now: [number, number] = [mean(movable.map((i) => i.x)), mean(movable.map((i) => i.y))];
  const mid: [number, number] = [mean(at.map((p) => p[0] * scale)), mean(at.map((p) => p[1] * scale))];
  let out = text;
  const glide: Glide[] = [];
  movable.forEach((item, n) => {
    const [px, py] = at[n] ?? [0, 0];
    const to: [number, number] = [Math.round(px * scale - mid[0] + now[0]), Math.round(py * scale - mid[1] + now[1])];
    if (to[0] === item.x && to[1] === item.y) return;
    out = moveItem(out, item.id, to[0], to[1]);
    glide.push({ id: item.id, from: [item.x, item.y], to });
  });
  if (!glide.length) return { refused: word('board.arrange.already') };
  return { note: note.replace(text, () => out), undo: note, glide };
}
