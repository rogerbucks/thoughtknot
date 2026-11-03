// The globe's things and links where the 2D drawing draws none (editor spec §71, globe_view). The globe is laid from
// the drawing's marks (space-globe.ts), and some diagram types draw no things or no links: Density draws a heat map,
// Treemap and Containment draw boxes inside boxes. So the globe would be blank, or cards with no links. Where the
// drawing has no things, the globe takes the graph's own things; where it has no links, the graph's own links. A drawing
// that has them is laid as it is. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { GraphDrawing } from './note-reading.ts';

/** The size of a thing's card where the drawing draws none to take it from, in pixels of the space. */
const CARD = { width: 120, height: 36 };

/** `marks`, with `drawing`'s own things where they draw none, and its own links where they draw none between things. */
export function globeMarks(marks: readonly DrawMark[], drawing?: GraphDrawing): readonly DrawMark[] {
  if (!drawing) return marks;
  const boxes = marks.filter((m): m is DrawMark & { kind: 'box' } => m.kind === 'box' && m.of !== undefined);
  const things = new Set(boxes.map((b) => b.of));
  const linked = marks.some((m) => m.kind === 'link' && things.has(m.from) && things.has(m.to) && m.from !== m.to);
  const added: DrawMark[] = [];
  if (!boxes.length) {
    // each thing a card of the size the globe gives one, painted as the drawing paints its first mark
    const style = marks[0]?.style ?? 'thing';
    for (const b of drawing.boxes) {
      added.push({ id: `globe:${b.key}`, kind: 'box', style, of: b.key, name: b.text, x: 0, y: 0, ...CARD });
      things.add(b.key);
    }
  }
  if (!linked) {
    const style = marks.find((m) => m.kind === 'link')?.style ?? added[0]?.style ?? boxes[0]?.style ?? 'link';
    drawing.links.forEach((l, i) => {
      if (l.from === l.to || !things.has(l.from) || !things.has(l.to)) return;
      const words = l.reading || l.type;
      const ends = { from: l.from, to: l.to, ...(words ? { name: words } : {}) };
      added.push({ id: `globe:link:${i}`, kind: 'link', style, points: [], ...ends });
    });
  }
  return added.length ? [...marks, ...added] : marks;
}
