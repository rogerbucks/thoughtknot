// The roads between rooms: part of layer L4 (wiki/Rendering-spec.md; editor spec §73, render_marks). A road is one
// ribbon for the links between two rooms side by side, counted each way. In 3D it runs between its rooms where they
// stand, arched up over the ground. Host-free and pure.
import type { Detail } from './render-detail.ts';
import type { Look } from './render-look.ts';
import { inkOf } from './render-look.ts';
import type { RoadMark, View } from './render-marks.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene } from './render-scene.ts';
import { archOf, onScreen } from './render-tilt.ts';

/** How much a level's roads show: they stay, fainter, while the level inside opens, so a road never just vanishes (R20). */
export const roadAlpha = (detail: Detail, depth: number): number =>
  (detail.shown[depth] ?? 0) * (1 - 0.7 * (detail.shown[depth + 1] ?? 0));

/** What a road says of its links: both ways, one way, or nothing for a single link. */
export function countOf(forward: number, back: number): string {
  if (forward + back < 2) return '';
  if (forward && back) return `${forward} ⇄ ${back}`;
  return forward ? `${forward} →` : `← ${back}`;
}

/** The roads at each open depth. A level's roads fade out as the level inside it opens, as its names do. */
export function roadsOf(
  scene: Scene,
  spots: Map<string, Spot>,
  detail: Detail,
  view: View,
  colours: Map<string, string>,
  look: Look,
): RoadMark[] {
  const roads: RoadMark[] = [];
  scene.roads.forEach((at, depth) => {
    const alpha = roadAlpha(detail, depth);
    if (alpha < 0.05) return;
    for (const road of at) {
      const p = spots.get(road.a),
        q = spots.get(road.b);
      // only neighbours in the same room: links that leave it ride on the road of the room itself
      if (!p || !q || scene.nodes.get(road.a)?.parent !== scene.nodes.get(road.b)?.parent) continue;
      const [s, t] = [onScreen(p, view, depth), onScreen(q, view, depth)];
      if (s.behind || t.behind) continue; // round the far side of the globe: a signpost points the way instead
      roads.push({
        kind: 'road',
        a: road.a,
        b: road.b,
        from: [s.x, s.y],
        to: [t.x, t.y],
        via: archOf(p, q, view, depth),
        forward: road.forward,
        back: road.back,
        width: 2 + Math.log2(road.forward + road.back),
        fill: colours.get(road.a) ?? look.faint,
        count: countOf(road.forward, road.back),
        // the count on a white chip edged and written in the road's colour, as in the mockups
        ink: inkOf(colours.get(road.a) ?? look.faint, look.card, look),
        chip: look.card,
        alpha,
      });
    }
  });
  return roads;
}
