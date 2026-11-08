// The ego view on the new rendering (editor spec §73, render_ego; wiki/Rendering-spec.md, phase P4). One thing sits in
// the middle. The things one link away sit on a ring round it, and those two links away on a ring outside that. The
// rest are not drawn. Each thing is a dot with its name on a card, as items are in a network, in its subject's
// colour. Names wrap and show as the reader zooms in, so close in nothing is cut short (Roger, 8 Nov 2026).
//
// It gives a scene of one level and the places of its things, which the marks and painters draw as they draw any
// scene. The same graph always gives the same places. Host-free and pure.
import { busiest, ringsOf } from '../view-types/ego-view.ts';
import type { GraphShape } from '../types-shape.ts';
import type { OwnColour } from './render-look.ts';
import { ITEM_GAP, type Spot } from './render-rooms.ts';
import type { Scene, SceneNode, SceneRoad } from './render-scene.ts';

/** The room each thing takes round its ring, in the drawing's own units: a card's width, so names need not clash. */
export const EGO_STEP = 190;
/** The least distance from the middle to the first ring, and from one ring to the next. */
export const RING_GAP = 220;

/** An ego view laid out: its scene of one level, the place of each thing, and its subject's colour. */
export interface Ego {
  scene: Scene;
  spots: Map<string, Spot>;
  own: OwnColour;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The ego view of `shape` round `middle`, the busiest thing when none is given. `full` is the network's scene, so each
 * thing keeps the colour of its subject there. `own` is the colour a person picked for a subject, if any.
 */
export function egoOf(shape: GraphShape, full: Scene, middle?: string, own?: OwnColour): Ego | null {
  const known = new Set(shape.things.map((t) => t.key));
  const focus = middle !== undefined && known.has(middle) ? middle : busiest(shape);
  if (focus === null) return null;
  const away = ringsOf(shape, focus);
  const things = shape.things.filter((t) => away.has(t.key));
  const nodes = new Map<string, SceneNode>(
    things.map((t) => [t.key, { key: t.key, name: t.text, depth: 0, children: [], items: [t.key] }]),
  );
  const scene: Scene = {
    depths: full.depths.slice(-1),
    nodes,
    roots: things.map((t) => t.key).sort(byText),
    named: things.map((t) => t.key),
    roads: [roadsAmong(shape, away)],
  };
  return {
    scene,
    spots: ringPlaces(
      things.map((t) => t.key),
      away,
    ),
    own: subjectColour(full, own),
  };
}

/** The links among the things drawn, each pair once, counted each way. */
export function roadsAmong(shape: GraphShape, away: ReadonlyMap<string, number>): SceneRoad[] {
  const tally = new Map<string, SceneRoad>();
  for (const l of shape.links) {
    if (!away.has(l.from) || !away.has(l.to) || l.from === l.to) continue;
    const [a, b] = byText(l.from, l.to) < 0 ? [l.from, l.to] : [l.to, l.from];
    const road = tally.get(`${a}\n${b}`) ?? { a, b, forward: 0, back: 0, types: [] };
    if (l.from === a) road.forward++;
    else road.back++;
    if (!road.types.includes(l.type)) road.types = [...road.types, l.type].sort(byText);
    tally.set(`${a}\n${b}`, road);
  }
  return [...tally.values()].sort((p, q) => byText(p.a, q.a) || byText(p.b, q.b));
}

/** The middle at the centre, each ring's things in written order evenly round it, each ring wide enough for them. */
function ringPlaces(order: readonly string[], away: ReadonlyMap<string, number>): Map<string, Spot> {
  const r = ITEM_GAP / 2;
  const spots = new Map<string, Spot>();
  const rings: string[][] = [];
  for (const k of order) {
    const d = away.get(k) ?? 0;
    if (d === 0) spots.set(k, { x: 0, y: 0, r });
    else (rings[d - 1] ??= []).push(k);
  }
  let radius = 0;
  rings.forEach((ring) => {
    radius = Math.max(radius + RING_GAP, (ring.length * EGO_STEP) / (2 * Math.PI));
    // the first ring starts at the top; each further one is turned by half a step, so its things sit between
    const turn = -Math.PI / 2 + (rings.indexOf(ring) % 2 ? Math.PI / ring.length : 0);
    ring.forEach((k, i) => {
      const a = turn + (2 * Math.PI * i) / ring.length;
      spots.set(k, { x: radius * Math.cos(a), y: radius * Math.sin(a), r });
    });
  });
  return spots;
}

/** The colour of each thing: the index of its subject in the network's scene, or the one a person picked for it. */
export function subjectColour(full: Scene, own?: OwnColour): OwnColour {
  const top = (key: string): string => {
    let at = full.nodes.get(key);
    while (at?.parent !== undefined) at = full.nodes.get(at.parent);
    return at?.key ?? key;
  };
  return (key) => {
    const subject = top(key);
    const index = full.named.indexOf(subject);
    return own?.(subject) ?? (index >= 0 ? index : undefined);
  };
}
