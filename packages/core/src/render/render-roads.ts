// The roads between rooms: part of layer L4 (wiki/Rendering-spec.md; editor spec §73, render_marks). A road is one
// ribbon for the links between two rooms side by side, counted each way. It runs from edge to edge of its rooms. In 3D it runs between its rooms where they
// stand, arched up over the ground. Host-free and pure.
import type { Detail } from './render-detail.ts';
import type { Look } from './render-look.ts';
import { inkOf } from './render-look.ts';
import type { View } from './render-marks.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene } from './render-scene.ts';
import { archOf, onScreen } from './render-tilt.ts';

/** A road between two rooms: the links between them, counted each way. */
export interface RoadMark {
  kind: 'road';
  a: string;
  b: string;
  from: [number, number];
  to: [number, number];
  /** In 3D, the control point of the arch the road bows up in; a straight road has none. */
  via?: [number, number];
  forward: number;
  back: number;
  width: number;
  fill: string;
  /** The count written on the road, such as "3 ⇄ 1"; empty for a single link. */
  count: string;
  /** The ink of the count, on a chip of `chip` edged in the road's colour. */
  ink: string;
  chip: string;
  alpha: number;
  /** A wider line of this colour under it, when it is in focus, so it stands out from the roads it crosses. */
  halo?: string;
  /** Chevrons along it, each where it stands and the way it points, in radians: one row for each way links run. */
  chevrons?: [number, number, number][];
  /** Dashes, where it crosses a road drawn before it, so the two are easy to tell apart. */
  dash?: number[];
  /** The depth of the rooms it joins: names at this depth or deeper keep off it. */
  depth?: number;
}

/** How much a level's roads show: they stay, fainter, while the level inside opens, so a road never just vanishes (R20). */
export const roadAlpha = (detail: Detail, depth: number): number =>
  (detail.shown[depth] ?? 0) * (1 - 0.7 * (detail.shown[depth + 1] ?? 0));

/** A road starts to fade once one of its rooms is this wide, as a share of the screen's shorter side. */
const INSIDE_FROM = 0.6;
/** It is gone once one of its rooms is this wide: the reader is inside that room, and signposts mark the ways out. */
const INSIDE_AT = 1.1;

/**
 * How much a road between rooms `s` and `t` on the screen still shows as the reader zooms into one of them. All of it
 * shows while both are smaller than the screen. It fades to none as one comes to fill it (Roger).
 */
export function insideFade(s: Spot, t: Spot, view: View): number {
  const big = (2 * Math.max(s.r, t.r)) / Math.max(1, Math.min(view.w, view.h));
  const k = Math.min(1, Math.max(0, (big - INSIDE_FROM) / (INSIDE_AT - INSIDE_FROM)));
  return 1 - k * k * (3 - 2 * k);
}

/**
 * How much a road between rooms of two different rooms shows: as much as the road between those two has faded, as the
 * reader zooms inside one of them. So as a highway fades, the links it carried come into sight, one level in, and the
 * way out never goes blank (Roger, 13 Nov 2026). A road inside one room has 1: it always shows.
 */
export function handedOver(
  scene: Scene,
  spots: Map<string, Spot>,
  view: View,
  road: { a: string; b: string },
  depth: number,
): number {
  const [pa, pb] = [scene.nodes.get(road.a)?.parent, scene.nodes.get(road.b)?.parent];
  if (pa === pb) return 1;
  const [p, q] = [pa === undefined ? undefined : spots.get(pa), pb === undefined ? undefined : spots.get(pb)];
  if (!p || !q) return 0;
  const fade = 1 - insideFade(onScreen(p, view, depth - 1), onScreen(q, view, depth - 1), view);
  return fade < 0.05 ? 0 : fade;
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

/** How far apart chevrons stand along a road, in pixels. */
const CHEVRON_EVERY = 64;
/** How far either side of a road's middle no chevron stands, in pixels, so its chip stays clear. */
const CHIP_ROOM = 26;

/** The point `t` of the way along a road from `from` to `to`, bowed through `via`, and the way it runs there. */
function along(from: [number, number], to: [number, number], via: [number, number] | undefined, t: number) {
  const [c0, c1] = via ?? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const u = 1 - t;
  const x = u * u * from[0] + 2 * u * t * c0 + t * t * to[0],
    y = u * u * from[1] + 2 * u * t * c1 + t * t * to[1];
  const dx = 2 * u * (c0 - from[0]) + 2 * t * (to[0] - c0),
    dy = 2 * u * (c1 - from[1]) + 2 * t * (to[1] - c1);
  return [x, y, Math.atan2(dy, dx)] as const;
}

/**
 * The chevrons along a road, so its way shows at a glance (Roger, 7 Nov 2026). Forward ones point from `from` to
 * `to`, and back ones the other way. A road both ways has the two rows side by side, like the lanes of a road.
 */
export function chevronsOf(m: Pick<RoadMark, 'from' | 'to' | 'via' | 'forward' | 'back' | 'width' | 'count'>) {
  const { from, to, via, forward, back, width } = m;
  const long = via
    ? Math.hypot(via[0] - from[0], via[1] - from[1]) + Math.hypot(to[0] - via[0], to[1] - via[1])
    : Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = long < 24 ? 0 : Math.max(1, Math.floor(long / CHEVRON_EVERY));
  const side = forward && back ? width / 2 + 3 : 0;
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    // a single chevron on a short road stands at its middle, unless the chip is there
    const t = n === 1 && m.count ? 0.25 : (i + 0.5) / n;
    if (m.count && n > 1 && Math.abs(t - 0.5) * long < CHIP_ROOM) continue;
    const [x, y, a] = along(from, to, via, t);
    if (forward) out.push([x - Math.sin(a) * side, y + Math.cos(a) * side, a]);
    if (back) out.push([x + Math.sin(a) * side, y - Math.cos(a) * side, a + Math.PI]);
  }
  return out;
}

/** A kind of link in words: DEPENDS_ON is "depends on". */
export const wordsOf = (type: string): string => type.replace(/_/g, ' ').toLowerCase();

/** What a road between two items says: the kind of its links where they are of one kind, and how many. */
export function sayOf(types: readonly string[], forward: number, back: number): string {
  const count = countOf(forward, back);
  if (types.length !== 1) return count;
  return count ? `${wordsOf(types[0] as string)} · ${count}` : wordsOf(types[0] as string);
}

/** Whether the line from `p` to `q` passes through the box `x`, `y`, `w`, `h` grown by `pad` all round. */
function throughBox(
  p: [number, number],
  q: [number, number],
  b: { x: number; y: number; w: number; h: number },
  pad: number,
) {
  let [lo, hi] = [0, 1];
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  // the line cut down to the part inside each pair of sides in turn
  for (const [d, from, min, max] of [
    [dx, p[0], b.x - pad, b.x + b.w + pad],
    [dy, p[1], b.y - pad, b.y + b.h + pad],
  ] as const) {
    if (!d) {
      if (from < min || from > max) return false;
      continue;
    }
    const [t1, t2] = [(min - from) / d, (max - from) / d];
    [lo, hi] = [Math.max(lo, Math.min(t1, t2)), Math.min(hi, Math.max(t1, t2))];
    if (lo > hi) return false;
  }
  return true;
}

/** Whether road `m` runs under the box `b`: along its line, or its arch, and the width of its ribbon. */
export function underBox(m: RoadMark, b: { x: number; y: number; w: number; h: number }): boolean {
  const pad = m.width / 2 + 1;
  if (!m.via) return throughBox(m.from, m.to, b, pad);
  const top = along(m.from, m.to, m.via, 0.5);
  return throughBox(m.from, [top[0], top[1]], b, pad) || throughBox([top[0], top[1]], m.to, b, pad);
}

/** Whether the lines from `p` to `q` and from `r` to `s` cross. */
function cross(p: [number, number], q: [number, number], r: [number, number], s: [number, number]): boolean {
  const side = (a: [number, number], b: [number, number], c: [number, number]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0;
}

/**
 * Where two roads cross, the later is dashed in the colour of its other end. So it is plain which is which (Roger,
 * 7 Nov 2026). Roads that share an end never cross.
 */
export function apartOf(roads: RoadMark[], colours: Map<string, string>): RoadMark[] {
  return roads.map((m, i) => {
    const crossed = roads
      .slice(0, i)
      .some((o) => ![o.a, o.b].includes(m.a) && ![o.a, o.b].includes(m.b) && cross(o.from, o.to, m.from, m.to));
    return crossed ? { ...m, dash: [7, 5], fill: colours.get(m.b) ?? m.fill } : m;
  });
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
  const last = scene.depths.length - 1;
  scene.roads.forEach((at, depth) => {
    const shown = roadAlpha(detail, depth);
    // with Faint roads on, a level's roads stay faintly in sight while that level shows at all (Roger, 7 Nov 2026)
    const least = (detail.shown[depth] ?? 0) > 0.05 ? (detail.faintRoads ?? 0) : 0;
    if (Math.max(shown, least) < 0.05) return;
    for (const road of at) {
      const p = spots.get(road.a),
        q = spots.get(road.b);
      if (!p || !q) continue;
      // links that leave a room ride on the road of the room itself, till the reader is inside it (handedOver)
      const over = handedOver(scene, spots, view, road, depth);
      if (!over) continue;
      const [s, t] = [onScreen(p, view, depth), onScreen(q, view, depth)];
      // the globe's far side has signposts instead. A road with one end round the back still runs to the ball's edge.
      const own = shown * insideFade(s, t, view);
      const alpha = s.behind && t.behind ? 0 : over < 1 ? over * own : Math.max(least, own);
      if (alpha < 0.05) continue;
      // a road runs from the edge of one room to the edge of the other, never into its middle (Roger)
      const [from, to] = edgesOf(s, t);
      const [via, width] = [archOf(p, q, view, depth), 2 + Math.log2(road.forward + road.back)];
      // between two items, a road says what kind of link it is (Roger, 7 Nov 2026: edges have no labels)
      const count = depth === last ? sayOf(road.types, road.forward, road.back) : countOf(road.forward, road.back);
      const { forward, back } = road;
      roads.push({
        kind: 'road',
        a: road.a,
        b: road.b,
        from,
        to,
        via,
        forward,
        back,
        width,
        fill: colours.get(road.a) ?? look.faint,
        count,
        chevrons: chevronsOf({ from, to, via, forward, back, width, count }),
        depth,
        // the count on a white chip edged and written in the road's colour, as in the mockups
        ink: inkOf(colours.get(road.a) ?? look.faint, look.card, look),
        chip: look.card,
        alpha,
      });
    }
  });
  return chipsApart(apartOf(roads, colours), last);
}

/** The box a road's words take on screen: half way along, or at the top of its arch, as the painter puts them. */
function chipBox(m: RoadMark): { x: number; y: number; w: number; h: number } {
  const [mx, my] = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2];
  const [x, y] = m.via ? [(mx + m.via[0]) / 2, (my + m.via[1]) / 2] : [mx, my];
  const w = m.count.length * 6.8 + 12;
  return { x: x - w / 2, y: y - 9, w, h: 18 };
}

/**
 * A road between items keeps its words only where they fit: on a road longer than them, clear of every chip kept
 * before. With no `depth`, every road is weighed so. Close in, the words never pile up over each other (Roger, 8 Nov 2026: "crazy busy"). The road itself always shows.
 */
export function chipsApart(roads: RoadMark[], depth?: number): RoadMark[] {
  const kept: { x: number; y: number; w: number; h: number }[] = [];
  return roads.map((m) => {
    if (!m.count || (depth !== undefined && m.depth !== depth)) return m;
    const b = chipBox(m);
    const long = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]) >= b.w + 2 * CHIP_ROOM;
    const clear = kept.every((k) => b.x >= k.x + k.w || k.x >= b.x + b.w || b.y >= k.y + k.h || k.y >= b.y + b.h);
    if (long && clear) return (kept.push(b), m);
    return { ...m, count: '', chevrons: chevronsOf({ ...m, count: '' }) };
  });
}
