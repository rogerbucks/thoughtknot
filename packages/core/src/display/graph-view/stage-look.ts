// The angle the new rendering's stage looks from, as the bar's button says. It is editor spec §53, space_one_bar,
// and phase P3 of wiki/Rendering-spec.md. 2D looks straight down. 2.5D and 3D tip the camera back over the
// same marks. The globe wraps them round a ball (ES§71, globe_view). One look at every zoom, never an old one beside it
// (Roger, 7 Nov 2026). Host-free and pure.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import { shapeOf } from '../../types-shape.ts';
import { sceneOf, type Scene } from '../../render/render-scene.ts';
import { word } from '../../words.ts';
import { panView } from '../../render/render-camera.ts';
import { bendOf, isGlobe } from '../../render/render-globe.ts';
import type { View } from '../../render/render-marks.ts';
import { roomsOf, type Spot } from '../../render/render-rooms.ts';
import { egoOf } from '../../render/render-ego.ts';
import type { OwnColour } from '../../render/render-look.ts';
import { isTilted, turnedBy } from '../../render/render-tilt.ts';

/** Whether `drawing` has levels for the new rendering to show: more than one, so more than a flat list. */
export function hasLevels(drawing: GraphDrawing, g?: Graph): boolean {
  return sceneOf(shapeOf(drawing, g)).depths.length > 1;
}

/**
 * Whether a card's diagram is drawn as a network: no other type chosen, nor a table or a view's own picture. The stage
 * draws only a network, so a card drawn as another type shows that type. Roger, 7 Nov 2026: "I click different diagram
 * types and nothing happens".
 */
export const aNetwork = (d?: { choice: { drawn: string }; table?: unknown; picture?: unknown }): boolean =>
  !d || (d.choice.drawn === 'network' && !d.table && !d.picture);

/** Whether a card's diagram is the ego view, which the stage draws too (render_ego, Roger 8 Nov 2026). */
export const anEgo = (d?: { picture?: { type: string }; table?: unknown }): boolean =>
  !!d?.picture && /(^|\.)ego$/.test(d.picture.type) && !d.table;

/**
 * What the stage draws and where each node sits: the network's rooms, or with `ego` its rings round the busiest thing.
 * An ego view's things keep their subject's colour: `hands.own` is swapped for one that says it.
 */
export function laidOut<H extends { own?: OwnColour }>(
  drawing: GraphDrawing,
  g: Graph | undefined,
  ego: boolean,
  hands?: H,
  saved?: ReadonlyMap<string, { x: number; y: number }>,
): { scene: Scene; spots: Map<string, Spot>; hands: H | undefined } {
  const shape = shapeOf(drawing, g),
    scene = sceneOf(shape);
  const rings = ego ? egoOf(shape, scene, undefined, hands?.own) : null;
  if (!rings) return { scene, spots: roomsOf(scene, saved), hands };
  return { scene: rings.scene, spots: rings.spots, hands: hands && { ...hands, own: rings.own } };
}

/** What the stage draws a card's diagram as: an ego view, a network, or neither (today's drawing shows). */
export const stageKind = (
  d?: Parameters<typeof aNetwork>[0] & { picture?: { type: string } },
): 'ego' | 'network' | null => (anEgo(d) ? 'ego' : aNetwork(d) ? 'network' : null);

/** How far 2.5D and 3D tip the camera back, in radians: the ground at a slant, its far side still easy to read. */
const TILTS: Record<string, number> = { cards: 0.6, balls: 0.8 };
/** How high each level stands in 2.5D and 3D: 2.5D lies on the ground, 3D stands each level on the one that holds it. */
const LIFTS: Record<string, number> = { cards: 0, balls: 1 };

/** `view` looked at straight down: no tilt, no turn, no globe. */
export const flatOf = (view: View): View => ({ ...view, tilt: 0, turn: 0, lift: 0, globe: 0 });

/**
 * `view` as the bar's `mode` shows it: flat with none, tipped back in 2.5D and 3D, wrapped round a ball on the globe.
 * None where the stage does not show that mode. It keeps where the reader looks and how near.
 */
export function lookedFrom(view: View, mode: string | null, spots: Iterable<Spot>): View | null {
  if (mode === 'globe') return { ...flatOf(view), globe: bendOf(spots) };
  const tilt = mode ? TILTS[mode] : 0;
  if (tilt === undefined) return null;
  return { ...view, tilt, turn: view.turn ?? 0, lift: (mode && LIFTS[mode]) || 0, globe: 0 };
}

/** Whether `a` already looks from where `b` does, so there is nothing to glide. */
export const sameLook = (a: View, b: View): boolean =>
  (a.tilt ?? 0) === (b.tilt ?? 0) && (a.lift ?? 0) === (b.lift ?? 0) && (a.globe ?? 0) === (b.globe ?? 0);

/**
 * `view` turned as a drag of `dx`, `dy` pixels would turn it: a tilted camera turns and tips, and the globe spins
 * under the pointer. None while flat: there is nothing to turn.
 */
export function turnedView(view: View, dx: number, dy: number): View | null {
  if (isGlobe(view)) return panView(view, dx, dy);
  return isTilted(view) ? turnedBy(view, dx, dy) : null;
}

/** The level `level` of `scene`, as a reader is told it: "Level 2 of 3 · Areas". */
export const levelSaid = (scene: Scene, level: number): string =>
  word('levels.badge', { at: level + 1, count: scene.depths.length, name: scene.depths[level] ?? '' });
