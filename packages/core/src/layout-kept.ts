// Things stay put (editor spec §68, things_stay_put). Each card's last drawing by our own engine says where it put each
// thing. The card's next drawing, by the same layout, is laid out with those spots kept. So a View menu switch, a filter
// or an edit to the note moves nothing already shown. A new type, layout, direction or lanes is a new layout, asked for.
import type { GraphDrawing } from './note-reading.ts';
import type { Drawn } from './render.ts';
import { SPOTS_ATTRIBUTE } from './layouts/own-draw.ts';
import { spotsHeard } from './layouts/kept-spots.ts';

/** What makes a drawing laid out the same way as another: so its things may keep their spots. */
const sameLayout = (d: GraphDrawing): string =>
  JSON.stringify([d.graph, d.engine, d.diagram, d.direction, d.layoutOptions, d.kindLanes, d.routing]);

const SPOTS = new RegExp(`<svg\\b[^>]*\\s${SPOTS_ATTRIBUTE}="([^"]*)"`);

/** Each card's last spots, by the layout they were laid out by. */
export class KeptSpots {
  private readonly last = new WeakMap<object, { layout: string; spots: Record<string, [number, number]> }>();

  /** `drawing` for `owner`, with the spots its last drawing by the same layout put things at. */
  onto(owner: object, drawing: GraphDrawing): GraphDrawing {
    const was = this.last.get(owner);
    // an exploration places its things itself (explore_shapes); a plug-in's layout gives its own spots
    if (!was || drawing.placed || drawing.engine !== 'own' || was.layout !== sameLayout(drawing)) return drawing;
    return { ...drawing, kept: was.spots };
  }

  /** Hears where `drawn` put each thing for `owner`, and where its settled layout does once that comes. */
  heard(owner: object, drawing: GraphDrawing, drawn: Drawn | unknown): void {
    if (!drawn || typeof drawn !== 'object' || !('svg' in drawn)) return;
    const d = drawn as Drawn;
    const spots = spotsHeard(SPOTS.exec(d.svg)?.[1]);
    if (spots.size) this.last.set(owner, { layout: sameLayout(drawing), spots: Object.fromEntries(spots) });
    void d.better?.then((b) => b && this.heard(owner, drawing, b));
  }
}
