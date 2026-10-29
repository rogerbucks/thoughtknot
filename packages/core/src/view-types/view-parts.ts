// A view type's marks, written as Graphviz writes a drawing (editor spec §68, projections_all_on). Each thing's marks
// are a node, and each link's an edge, numbered by where the graph writes them. So a card reads a view as a network. A thing is chosen, opened and moved by the same clicks in every view. Marks of no thing or link, such as
// a column's name, stay in the drawing itself.
import { drawOrder } from '../drawing-marks.ts';
import type { DrawMark } from '../drawing-marks.ts';
import type { LaidPart } from '../graphviz-marks.ts';
import type { GraphShape } from '../types-shape.ts';

/**
 * The parts of `marks` drawn for `shape`: the drawing first, then each link, then each thing, under the ids Graphviz
 * gives them. A thing is `node` and its place among the things, from 1. A link is `edge` and its place among the
 * links. A link mark is the next link written between its two ends; one that stands for several, as a matrix's cell
 * does, is the first.
 */
export function viewParts(marks: readonly DrawMark[], shape: GraphShape): LaidPart[] {
  const thingAt = new Map(shape.things.map((t, i) => [t.key, i]));
  const taken = new Set<number>();
  const linkOf = (from: string, to: string): number => {
    const all = shape.links.flatMap((l, i) => (l.from === from && l.to === to ? [i] : []));
    const next = all.find((i) => !taken.has(i)) ?? all[0] ?? -1;
    taken.add(next);
    return next;
  };
  const graph: string[] = [],
    things = new Map<number, string[]>(),
    links = new Map<number, string[]>();
  for (const m of drawOrder(marks)) {
    const thing = m.role !== 'link' && m.of !== undefined ? thingAt.get(m.of) : undefined;
    const link = m.kind === 'link' && m.role === 'link' && m.from && m.to ? linkOf(m.from, m.to) : -1;
    if (thing !== undefined) things.set(thing, [...(things.get(thing) ?? []), m.id]);
    else if (link >= 0) links.set(link, [...(links.get(link) ?? []), m.id]);
    else graph.push(m.id);
  }
  const part = (kind: 'node' | 'edge', i: number, title: string, ids: string[]): LaidPart => ({
    kind,
    id: `${kind}${i + 1}`,
    className: kind,
    title,
    marks: ids,
  });
  return [
    { kind: 'graph', id: '', className: '', title: '', marks: graph },
    ...[...links]
      .sort(([a], [b]) => a - b)
      .map(([i, ids]) => {
        const l = shape.links[i];
        return part('edge', i, l ? `${l.from}->${l.to}` : '', ids);
      }),
    ...[...things].sort(([a], [b]) => a - b).map(([i, ids]) => part('node', i, shape.things[i]?.key ?? '', ids)),
  ];
}
