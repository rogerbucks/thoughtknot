// Drawing on a graph, written to the note (editor spec §70, sketch_drawn and sketch_is_text). Each drawing made on the
// card is a change to the graph's drawings block. The first one writes the block, after the graph's last block. A
// drawing added, moved or taken away changes only its own text, so notes and comments in the block stay as they were.
//
// A freehand stroke is thinned before it is written, so it keeps its shape in a few points. A drawing made over a thing
// is pinned to it, so it moves with it. Host-free and pure.
import { gqlSpans, graphOf, graphOfBlock } from './blocks.ts';
import type { Span } from './blocks.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import { readSketch, sketchItemGql, sketchOf } from './sketch.ts';
import type { Sketch, SketchItem, SketchKind, SketchShape } from './sketch.ts';
import { insertBlockAfter, replaceSpan } from './store.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

/** A drawing to add: all a drawing holds but its id, which the block gives it. */
export type NewSketchItem = Omit<SketchItem, 'id' | 'more'>;

/** A change to the drawings over a graph: one added, one moved to a new place, or one taken away. */
export type SketchChange = { add: NewSketchItem } | { move: string; x: number; y: number } | { remove: string };

/** The drawings over `graph` in a note, and where their block is; null when the note has none. */
export function sketchInNote(note: string, graph: string): { sketch: Sketch; span: Span } | null {
  for (const span of gqlSpans(note))
    if (sketchOf(span.text)?.on === graph) return { sketch: readSketch(span.text).sketch, span };
  return null;
}

/** The first id of the form d1, d2… that the drawings do not hold. */
function freeId(sketch: Sketch | null): string {
  const held = new Set(sketch?.items.map((i) => i.id));
  let n = 1;
  while (held.has(`d${n}`)) n++;
  return `d${n}`;
}

/** The block's text with the drawing `id` taken out, and the comma that joined it to the others. */
function withoutItem(text: string, id: string): string | null {
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === id);
  if (!w) return null;
  let before = text.slice(0, w.open),
    after = text.slice(w.close + 1);
  const comma = /^[ \t]*,[ \t]*\r?\n?/.exec(after);
  if (comma) after = after.slice(comma[0].length);
  else before = before.replace(/,\s*$/, '');
  return (before + after).replace(/\n+$/, '');
}

/**
 * The note with one change made to the drawings over `graph`, and the id of a drawing added. The first drawing writes
 * the block, `// graph: trip_ink · SKETCH ON trip`, after the graph's last block. Resolves to why not, as words.
 */
export function sketchEdit(
  note: string,
  graph: string,
  change: SketchChange,
): { note: string; id?: string } | { refused: string } {
  const found = sketchInNote(note, graph);
  if ('add' in change) {
    const id = freeId(found?.sketch ?? null);
    const line = sketchItemGql({ ...change.add, id, more: {} });
    if (found) {
      const text = found.span.text.replace(/\s+$/, '');
      const joined = found.sketch.items.length || /\)\s*$/.test(text) ? `${text},\n${line}` : `${text}\n${line}`;
      return { note: replaceSpan(note, found.span, joined).note, id };
    }
    const spans = gqlSpans(note);
    const last = spans.filter((s) => graphOfBlock(s.text) === graph).pop();
    if (!last) return { refused: word('sketch.write.graph-gone', { graph }) };
    // a name no other block has: trip_ink, else trip_ink2 and on
    const names = new Set(spans.map((s) => graphOf(s.text)));
    let name = `${graph}_ink`;
    for (let n = 2; names.has(name); n++) name = `${graph}_ink${n}`;
    const r = insertBlockAfter(
      note,
      { line: last.open, text: last.text },
      `// graph: ${name} · SKETCH ON ${graph}\n${line}`,
    );
    return r.ok ? { note: r.note, id } : { refused: r.reason };
  }
  const id = 'move' in change ? change.move : change.remove;
  const item = found?.sketch.items.find((i) => i.id === id);
  if (!found || !item) return { refused: word('sketch.write.gone', { id }) };
  let text: string | null;
  if ('move' in change) {
    const w = writtenIn(found.span.text).find((t) => t.writes && t.variable?.name === id);
    const moved = sketchItemGql({ ...item, x: Math.round(change.x), y: Math.round(change.y) });
    text = w ? found.span.text.slice(0, w.open) + moved + found.span.text.slice(w.close + 1) : null;
  } else text = withoutItem(found.span.text, id);
  if (text === null) return { refused: word('sketch.write.gone', { id }) };
  return { note: replaceSpan(note, found.span, text).note };
}

/** The distance from point `p` to the line from `a` to `b`. */
function offLine(p: MarkPoint, a: MarkPoint, b: MarkPoint): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const long = Math.hypot(dx, dy);
  if (!long) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / long;
}

/**
 * A freehand stroke thinned: only the points it needs to keep its shape within `within` pixels (Ramer, Douglas and
 * Peucker's way). Its first and last points always stay.
 */
export function thinned(points: readonly MarkPoint[], within = 1.5): MarkPoint[] {
  if (points.length < 3) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const spans: [number, number][] = [[0, points.length - 1]];
  while (spans.length) {
    const [from, to] = spans.pop() as [number, number];
    let far = -1,
      most = within;
    for (let i = from + 1; i < to; i++) {
      const d = offLine(points[i] as MarkPoint, points[from] as MarkPoint, points[to] as MarkPoint);
      if (d > most) [far, most] = [i, d];
    }
    if (far < 0) continue;
    keep[far] = true;
    spans.push([from, far], [far, to]);
  }
  return points.filter((_, i) => keep[i]);
}

type Place = { x: number; y: number; width: number; height: number };
const holds = (b: Place, p: MarkPoint) => p[0] >= b.x && p[0] <= b.x + b.width && p[1] >= b.y && p[1] <= b.y + b.height;

/**
 * What a drawing begun at `at` is pinned to: the smallest thing there, else the smallest group there, else nothing.
 * It gives the pin as the thing's key or the group's name, and the centre the drawing's place is measured from.
 */
export function pinAt(marks: readonly DrawMark[], at: MarkPoint): { pin: string; centre: MarkPoint } | null {
  let best: { pin: string; box: Place; thing: boolean } | null = null;
  for (const m of marks) {
    if (m.kind !== 'box' && m.kind !== 'group') continue;
    const thing = m.kind === 'box';
    const pin = thing ? m.of : m.id.replace(/^g:/, '');
    if (!pin || !holds(m, at)) continue;
    const smaller =
      !best ||
      (thing && !best.thing) ||
      (thing === best.thing && m.width * m.height < best.box.width * best.box.height);
    if (smaller) best = { pin, box: m, thing };
  }
  return best ? { pin: best.pin, centre: [best.box.x + best.box.width / 2, best.box.y + best.box.height / 2] } : null;
}

/**
 * A drawing made on the card, ready to add: its points or box are in the drawing's own pixels, as drawn. It is pinned
 * to what it began over, unless `free`, and its place written from that one's centre. A stroke is thinned first.
 */
export function drawnItem(
  how: { kind: SketchKind; shape?: SketchShape; text?: string; style?: string; free?: boolean },
  points: readonly MarkPoint[],
  marks: readonly DrawMark[],
): NewSketchItem | null {
  const start = points[0];
  if (!start) return null;
  const on = how.free ? null : pinAt(marks, start);
  const [ox, oy] = on ? on.centre : [0, 0];
  const item: NewSketchItem = { kind: how.kind, x: 0, y: 0 };
  if (on) item.pin = on.pin;
  if (how.shape) item.shape = how.shape;
  if (how.text !== undefined) item.text = how.text;
  if (how.style !== undefined) item.style = how.style;
  const end = points[points.length - 1] ?? start;
  if (how.kind === 'Text') [item.x, item.y] = [Math.round(start[0] - ox), Math.round(start[1] - oy)];
  else if (how.kind === 'Ink' || how.shape === 'line' || how.shape === 'arrow') {
    const line = how.kind === 'Ink' ? thinned(points) : [start, end];
    if (line.length < 2) return null;
    [item.x, item.y] = [Math.round(start[0] - ox), Math.round(start[1] - oy)];
    item.points = line.map((p) => [Math.round(p[0] - start[0]), Math.round(p[1] - start[1])] as MarkPoint);
  } else {
    const [x, y] = [Math.min(start[0], end[0]), Math.min(start[1], end[1])];
    [item.x, item.y] = [Math.round(x - ox), Math.round(y - oy)];
    [item.w, item.h] = [Math.round(Math.abs(end[0] - start[0])), Math.round(Math.abs(end[1] - start[1]))];
  }
  return item;
}
