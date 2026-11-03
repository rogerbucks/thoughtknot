// The globe's things and links where the 2D drawing draws none (editor spec §71, globe_view). The globe is laid from
// the drawing's marks (space-globe.ts), and some diagram types draw no things or no links: Density draws a heat map,
// Treemap and Containment draw boxes inside boxes. So the globe would be blank, or cards with no links. Where the
// drawing has no things, the globe takes the graph's own things; where it has no links, the graph's own links. A drawing
// that has them is laid as it is. The points where a big drawing merges its links are no things here: each run of
// links through them is one link from thing to thing. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { GraphDrawing } from './note-reading.ts';
import { isPoint } from './space-spread.ts';

type LinkMark = DrawMark & { kind: 'link' };

/** The size of a thing's card where the drawing draws none to take it from, in pixels of the space. */
const CARD = { width: 120, height: 36 };

/** `marks`, with `drawing`'s own things where they draw none, and its own links where they draw none between things. */
export function globeMarks(drawn: readonly DrawMark[], drawing?: GraphDrawing): readonly DrawMark[] {
  const marks = trunksJoined(drawn);
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

/**
 * `marks` with the points where a big drawing merges its links taken out (space-spread.ts). They are no things: on the
 * globe each took a thing's room, and crowded the folded groups' cards together over the front of it (review of 1 Nov
 * 2026, finding 12). Each run of links through them becomes one link from thing to thing, drawn as its last part is,
 * with its arrowhead.
 */
export function trunksJoined(marks: readonly DrawMark[]): readonly DrawMark[] {
  const points = new Set(marks.flatMap((m) => (m.kind === 'box' && isPoint(m) ? [m.of] : [])));
  if (!points.size) return marks;
  const out = new Map<string, LinkMark[]>();
  for (const m of marks)
    if (m.kind === 'link' && m.from !== undefined && points.has(m.from))
      out.set(m.from, [...(out.get(m.from) ?? []), m]);
  // the parts that leave the run through point `at` for a thing, each point passed once
  const ends = (at: string, seen: Set<string>): LinkMark[] =>
    (out.get(at) ?? []).flatMap((n) =>
      n.to === undefined || seen.has(n.to) ? [] : points.has(n.to) ? ends(n.to, seen.add(n.to)) : [n],
    );
  const kept: DrawMark[] = [];
  for (const m of marks) {
    if (m.kind === 'box' && points.has(m.of)) continue;
    if (m.kind !== 'link' || !points.has(m.to)) {
      if (m.kind !== 'link' || !points.has(m.from)) kept.push(m); // a part out of a point is joined from its start
      continue;
    }
    if (m.from === undefined || points.has(m.from)) continue;
    for (const last of ends(m.to as string, new Set([m.to as string])))
      kept.push({ ...last, id: `${m.id}>${last.id}`, from: m.from });
  }
  return kept;
}
