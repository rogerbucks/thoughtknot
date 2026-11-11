// Where a timeline or a radial drawing puts each thing, for its SVG (editor spec §15, layout_own_engine). Graphviz laid
// these two types out on its own; now our own engine keeps the places the new stage gives them (render-laid.ts). So
// the SVG and the stage agree. Host-free and pure.
import type { GraphDrawing } from '../note-reading.ts';
import { shapeOf } from '../types-shape.ts';
import { isLaid, placesOf } from './render-laid.ts';

/** The diagram types Graphviz laid out on its own, which now keep the places the stage gives them. */
const PLACED_TYPES = new Set(['timeline', 'radial']);
/** Each thing's spot in `d` as its diagram type places it on the stage (render-laid.ts); none for another type. */
export function typePlaces(d: GraphDrawing): Record<string, [number, number]> | undefined {
  const type = d.diagram?.type;
  if (!type || !PLACED_TYPES.has(type) || !isLaid(type) || (d.routing && d.routing !== 'direct')) return undefined;
  const places = placesOf(type, shapeOf(written(d)), d.diagram);
  return Object.fromEntries([...places].map(([k, p]) => [k, [p.x, p.y] as [number, number]]));
}

/** `d` with each thing a before nudge names moved to just before the other, as Graphviz read them (radial_spoke_order). */
function written(d: GraphDrawing): GraphDrawing {
  let boxes = d.boxes;
  for (const n of d.nudges ?? []) {
    if (n.word !== 'before') continue;
    const from = boxes.findIndex((b) => b.key === n.thing);
    if (from < 0 || !boxes.some((b) => b.key === n.other)) continue;
    const rest = boxes.filter((_, i) => i !== from);
    const to = rest.findIndex((b) => b.key === n.other);
    boxes = [...rest.slice(0, to), boxes[from] as (typeof boxes)[number], ...rest.slice(to)];
  }
  return boxes === d.boxes ? d : { ...d, boxes };
}
