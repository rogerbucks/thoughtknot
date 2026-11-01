// A view of the core's own, drawn as the card's drawing rather than a picture to look at (editor spec §68,
// projections_all_on). Its things and links are written as Graphviz writes them (view-parts.ts). So each is chosen,
// opened and centred by the same clicks as in a network.
import { CORE_DIAGRAMS_ID } from '@thoughtknot/core';
import type { Drawn } from '@thoughtknot/core';
import type { DiagramShown } from './type-strip';

/** `o` with a view of the core's own as its drawing, its picture marked live so it is not shown again apart. */
export function viewDrawn<O extends { drawn: Drawn; diagram?: DiagramShown }>(o: O): O {
  const p = o.diagram?.picture;
  if (!p || p.plugin !== CORE_DIAGRAMS_ID || !o.diagram) return o;
  const drawn: Drawn = { svg: p.svg, rankdir: 'LR', width: p.width, height: p.height };
  return { ...o, drawn, diagram: { ...o.diagram, picture: { ...p, live: true } } };
}
