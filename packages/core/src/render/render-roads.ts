// The roads between rooms: part of layer L4 (wiki/Rendering-spec.md; editor spec §73, render_marks). A road is one
// ribbon for the links between two rooms side by side, counted each way. It runs from edge to edge of its rooms. In 3D it runs between its rooms where they
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

/** A road starts to fade once one of its rooms is this wide, as a share of the screen's shorter side. */
const INSIDE_FROM = 0.6;
/** It is gone once one of its rooms is this wide: the reader is inside that room, and signposts mark the ways out. */
const INSIDE_AT = 1.1;

/**
 * How much a road between rooms `s` and `t` on the screen still shows as the reader zooms into one of them: all of it
 * while both are smaller than the screen, fading to none as one comes to fill it (Roger).
 */
export function insideFade(s: Spot, t: Spot, view: View): number {
  const big = (2 * Math.max(s.r, t.r)) / Math.max(1, Math.min(view.w, view.h));
  const k = Math.min(1, Math.max(0, (big - INSIDE_FROM) / (INSIDE_AT - INSIDE_FROM)));
  return 1 - k * k * (3 - 2 * k);
}

/** The most of a road's length each end may give up to reach its room's edge, so a road between close rooms still shows. */
const MOST_TRIM = 0.4;

/** The ends of a road from `s` to `t` on the screen, each moved in from its room's middle to the room's edge. */
export function edgesOf(s: Spot, t: Spot): [[number, number], [number, number]] {
  const [dx, dy] = [t.x - s.x, t.y - s.y],
    d = Math.hypot(dx, dy);
  if (!d)
    return [
      [s.x, s.y],
      [t.x, t.y],
    ];
  const [a, b] = [Math.min(s.r, d * MOST_TRIM) / d, Math.min(t.r, d * MOST_TRIM) / d];
  return [
    [s.x + dx * a, s.y + dy * a],
    [t.x - dx * b, t.y - dy * b],
  ];
}

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
    const shown = roadAlpha(detail, depth);
    if (shown < 0.05) return;
    for (const road of at) {
      const p = spots.get(road.a),
        q = spots.get(road.b);
      // only neighbours in the same room: links that leave it ride on the road of the room itself
      if (!p || !q || scene.nodes.get(road.a)?.parent !== scene.nodes.get(road.b)?.parent) continue;
      const [s, t] = [onScreen(p, view, depth), onScreen(q, view, depth)];
      const alpha = shown * insideFade(s, t, view);
      if (alpha < 0.05) continue;
      // a road runs from the edge of one room to the edge of the other, never into its middle (Roger)
      const [from, to] = edgesOf(s, t);
      roads.push({
        kind: 'road',
        a: road.a,
        b: road.b,
        from,
        to,
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
