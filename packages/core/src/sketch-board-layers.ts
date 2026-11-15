// Board layers shown over a graph's views (editor spec §70, board_layers_over; rendering rule R16). A layer of a
// board on a graph can be shown over every view of that graph: 2D, 2.5D, 3D and the globe. Its items become
// drawings, as a drawings block holds them, so every view draws them the way it already draws drawings.
//
// An item linked to a thing is pinned to it, so it moves with the thing in whatever layout the view uses. An item
// with no link lies on the plane, at its place on the board. Nothing is written: the board stays the only store, and
// a layer holds no place of its own in any view.
import { gqlSpans } from './blocks.ts';
import { boardOf, readBoard } from './board.ts';
import type { Board, BoardItem } from './board.ts';
import { layerOf } from './board-layers.ts';
import { cardOf } from './board-card.ts';
import { itemBox } from './board-svg.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import type { Sketch, SketchItem } from './sketch.ts';

/** How far under the middle of its thing the words of a linked item are written, in the drawing's pixels. */
export const UNDER = 44;
/** The room between a free item's edge and its words. */
const PAD = 8;
/** How far down the first line of words sits from the top of its item. */
const LINE = 20;

/** The words an item shows: a card's title, else its text. */
const wordsOf = (item: BoardItem): string => (item.kind === 'Card' ? cardOf(item).title : (item.text ?? '')).trim();

/** An ink item's points, from its own corner: whole numbers in pairs, at least two pairs; else none. */
function pointsOf(item: BoardItem): MarkPoint[] | null {
  const text = item.more.points;
  if (typeof text !== 'string') return null;
  const nums = text
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (nums.length < 4 || nums.length % 2 || !nums.every(Number.isFinite)) return null;
  const out: MarkPoint[] = [];
  for (let i = 0; i < nums.length; i += 2) out.push([Math.round(nums[i] ?? 0), Math.round(nums[i + 1] ?? 0)]);
  return out;
}

/** The drawings one board item becomes: a shape round it or its thing, and its words. `id` names them in the view. */
function drawingsOf(item: BoardItem, id: string): SketchItem[] {
  const style = item.style === undefined ? {} : { style: item.style };
  const words = wordsOf(item);
  const points = item.kind === 'Ink' ? pointsOf(item) : null;
  if (item.graph !== undefined) {
    // linked to a thing: pinned to it. A frame or shape is drawn round the thing; the words go under it.
    const pin = { pin: item.graph, ...style, more: {} };
    const out: SketchItem[] = [];
    if (points) out.push({ id, kind: 'Ink', x: 0, y: 0, points, ...pin });
    else if (item.kind === 'Frame' || item.kind === 'Shape') out.push({ id, kind: 'Shape', x: 0, y: 0, ...pin });
    if (words) out.push({ id: `${id}.words`, kind: 'Text', x: 0, y: UNDER, text: words, ...pin });
    return out;
  }
  // free: on the plane, where it is on the board
  const box = itemBox(item);
  const free = { ...style, more: {} };
  if (points) return [{ id, kind: 'Ink', x: box.x, y: box.y, points, ...free }];
  const text: SketchItem = {
    id: `${id}.words`,
    kind: 'Text',
    x: box.x + PAD,
    y: box.y + LINE,
    w: Math.max(1, box.w - 2 * PAD),
    text: words,
    ...free,
  };
  if (item.kind === 'Text') return words ? [text] : [];
  const shape: SketchItem = { id, kind: 'Shape', x: box.x, y: box.y, w: box.w, h: box.h, ...free };
  return words ? [shape, text] : [shape];
}

/** The drawings of a board's layers that are shown over the views: not the hidden ones, lower layers first. */
export function layerDrawings(board: Board): SketchItem[] {
  const over = (i: BoardItem) => {
    const layer = layerOf(board, i);
    return layer?.over && !layer.hidden ? layer : null;
  };
  return board.items
    .filter((i) => over(i))
    .sort((a, b) => (over(a)?.order ?? 0) - (over(b)?.order ?? 0) || (a.layer ?? 0) - (b.layer ?? 0))
    .flatMap((i) => drawingsOf(i, `${board.name}.${i.id}`));
}

/**
 * The board layers shown over the views of `graph`, from every board on that graph in the note, as drawings. Null
 * when there are none. They are for drawing only: a host never writes them back.
 */
export function layersOver(note: string, graph: string): Sketch | null {
  const items = gqlSpans(note)
    .filter((s) => boardOf(s.text)?.on === graph)
    .flatMap((s) => layerDrawings(readBoard(s.text).board));
  return items.length ? { name: '', on: graph, items } : null;
}

/** The drawings over a graph with the board layers shown over it: both drawn alike. Null when there are neither. */
export function withLayers(sketch: Sketch | null, over: Sketch | null | undefined): Sketch | null {
  if (!over?.items.length) return sketch;
  return sketch ? { ...sketch, items: [...over.items, ...sketch.items] } : over;
}
