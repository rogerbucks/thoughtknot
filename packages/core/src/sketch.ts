// Drawings on a graph (editor spec §70, sketch_is_text and sketch_checked; Roger, 27 Oct 2026, #1450). Freehand ink,
// shapes and short notes drawn over a graph's drawing are kept in a block of their own beside it:
// `// graph: trip_ink · SKETCH ON trip`. They are read with the board's reader (board.ts), with three of its kinds:
// - Ink: a freehand stroke, its points as pairs of whole numbers, `points: '0 0 12 4 30 9'`. A graph holds no lists.
// - Shape: a box or an ellipse of a size, or a line or an arrow through two points. `shape` says which.
// - Text: a short note.
// A drawing may be pinned to a thing or a group (`pin: 'ann'`). Its place is then an offset from that one's centre, so
// it moves with it when the layout moves. Without a pin, its place is a spot on the drawing. sketch-marks.ts draws them.
//
// The note's text stays the only store, as for every graph. Host-free and pure.
import type { Value } from '@thoughtknot/graph-spec';
import { sketchOf } from './blocks.ts';
import { itemGql, readItems } from './board.ts';
import type { BoardItem } from './board.ts';
import type { Problem } from './note-reading.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

export { sketchOf };

/** The kinds of drawing: a freehand stroke, a shape and a note. */
export const SKETCH_KINDS = ['Ink', 'Shape', 'Text'] as const;
/** One kind of drawing. */
export type SketchKind = (typeof SKETCH_KINDS)[number];

/** The shapes a Shape may be. A box and an ellipse have a size; a line and an arrow run through two points. */
export const SKETCH_SHAPES = ['box', 'ellipse', 'line', 'arrow'] as const;
/** One shape. */
export type SketchShape = (typeof SKETCH_SHAPES)[number];

/** One drawing, as read from its block. */
export interface SketchItem {
  id: string;
  kind: SketchKind;
  /** Its place: from the centre of what it is pinned to, or on the drawing when it has no pin. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** The key of the thing, or the name of the group, it is pinned to. */
  pin?: string;
  /** A Shape's shape; a Shape that names none is a box. */
  shape?: SketchShape;
  /** An ink stroke's points, or a line's or arrow's two ends, each from its place. */
  points?: MarkPoint[];
  text?: string;
  /** A hue token, such as 'red', never a colour of its own. */
  style?: string;
  /** Any other property, kept as written, in the order written. */
  more: Record<string, Value>;
}

/** The drawings over one graph. */
export interface Sketch {
  name: string;
  /** The graph they are drawn over. */
  on: string;
  items: SketchItem[];
}

const KINDS = new Set<string>(SKETCH_KINDS);
const SHAPES = new Set<string>(SKETCH_SHAPES);

/** Points read from their text, whole numbers in pairs, `'0 0 12 4'`, at least two pairs; null when they are not. */
function pointsOf(v: Value | undefined): MarkPoint[] | null {
  if (typeof v !== 'string') return null;
  const nums = v
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (nums.length < 4 || nums.length % 2 || !nums.every(Number.isFinite)) return null;
  const out: MarkPoint[] = [];
  for (let i = 0; i < nums.length; i += 2) out.push([Math.round(nums[i] ?? 0), Math.round(nums[i + 1] ?? 0)]);
  return out;
}

/** Whether a drawing is drawn through points: an ink stroke, a line or an arrow. */
export const throughPoints = (item: { kind: SketchKind; shape?: SketchShape }): boolean =>
  item.kind === 'Ink' || (item.kind === 'Shape' && (item.shape === 'line' || item.shape === 'arrow'));

/**
 * The drawings a block holds, with their problems. `things` are the keys of the things and groups of the graph they are
 * drawn over. Each pin is checked against them, and not checked when they are not given. `block` is the block's place
 * in the note, for the problems. Whatever can be read is kept, so it can still be drawn; nothing is written to the note.
 */
export function readSketch(text: string, things?: Set<string>, block = 0): { sketch: Sketch; problems: Problem[] } {
  const line = sketchOf(text);
  const read = readItems(
    text,
    line,
    KINDS,
    (kind, id) => ({
      code: 'GN905',
      message: word('sketch.kind-unknown', { kind, id }),
      fix: word('sketch.kind-unknown.fix', { kinds: SKETCH_KINDS.join(', ') }),
    }),
    undefined,
    block,
  );
  const sketch: Sketch = { name: line?.name ?? '', on: line?.on ?? '', items: [] };
  const problems = read.problems;
  const lineOf = new Map<string, number>();
  for (const w of writtenIn(text))
    if (w.writes && w.variable && !lineOf.has(w.variable.name))
      lineOf.set(w.variable.name, text.slice(0, w.open).split('\n').length);
  const problem = (id: string, code: string, message: string, fix: string) =>
    problems.push({ graph: sketch.name, block, line: lineOf.get(id) ?? 1, severity: 'error', code, message, fix });
  for (const it of read.board.items) {
    const { pin, shape, points, ...more } = it.more;
    const item: SketchItem = { id: it.id, kind: it.kind as SketchKind, x: it.x, y: it.y, more };
    if (it.w !== undefined) item.w = it.w;
    if (it.h !== undefined) item.h = it.h;
    if (it.text !== undefined) item.text = it.text;
    if (it.style !== undefined) item.style = it.style;
    // a pin, shape or points this drawing cannot use is kept as written, so a write never loses it
    if (pin !== undefined && typeof pin !== 'string') item.more = { pin, ...item.more };
    if (typeof pin === 'string') {
      item.pin = pin;
      if (things && !things.has(pin))
        problem(
          it.id,
          'GN906',
          word('sketch.pin-gone', { id: it.id, thing: pin, graph: sketch.on }),
          word('sketch.pin-gone.fix', { thing: pin, graph: sketch.on }),
        );
    }
    if (item.kind === 'Shape') {
      if (typeof shape === 'string' && SHAPES.has(shape)) item.shape = shape as SketchShape;
      else if (shape !== undefined) {
        item.more = { shape, ...item.more };
        problem(
          it.id,
          'GN907',
          word('sketch.shape-unknown', {
            id: it.id,
            shape: typeof shape === 'string' ? shape : JSON.stringify(shape),
            shapes: SKETCH_SHAPES.join(', '),
          }),
          word('sketch.shape-unknown.fix', { shapes: SKETCH_SHAPES.join(', ') }),
        );
      }
    } else if (shape !== undefined) item.more = { shape, ...item.more };
    if (throughPoints(item)) {
      const read = pointsOf(points);
      if (!read) {
        problem(it.id, 'GN908', word('sketch.points', { id: it.id }), word('sketch.points.fix'));
        continue;
      }
      item.points = read;
    } else if (points !== undefined) item.more = { ...item.more, points };
    sketch.items.push(item);
  }
  problems.sort((a, b) => a.line - b.line);
  return { sketch, problems };
}

/** One drawing written as GQL, its properties in the one fixed order: the board's own, then its pin, shape and points. */
export function sketchItemGql(item: SketchItem): string {
  const more: Record<string, Value> = {};
  if (item.pin !== undefined) more.pin = item.pin;
  if (item.shape !== undefined) more.shape = item.shape;
  if (item.points) more.points = item.points.flat().join(' ');
  for (const [key, v] of Object.entries(item.more)) if (!(key in more)) more[key] = v;
  const { w, h, text, style } = item;
  const board: BoardItem = { id: item.id, kind: item.kind, x: item.x, y: item.y, w, h, text, style, more };
  return itemGql(board);
}

/** Drawings written as their block, in the one fixed form: the graph line, then each drawing on a line. */
export function writeSketch(sketch: Sketch): string {
  const lines = sketch.items.map(sketchItemGql);
  return [
    `// graph: ${sketch.name} · SKETCH ON ${sketch.on}`,
    ...lines.map((l, i) => (i < lines.length - 1 ? `${l},` : l)),
  ].join('\n');
}
