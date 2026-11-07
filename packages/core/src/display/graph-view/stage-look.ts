// The angle the new rendering's stage looks at its drawing from, as the bar's button says (editor spec §53,
// space_one_bar; phase P3 of wiki/Rendering-spec.md). 2D looks straight down. 2.5D and 3D tip the camera back over the
// same marks. The globe wraps them round a ball (§71, globe_view). One look at every zoom, never an old one beside it
// (Roger, 7 Nov 2026). Host-free and pure.
import { panView } from '../../render/render-camera.ts';
import { bendOf, isGlobe } from '../../render/render-globe.ts';
import type { View } from '../../render/render-marks.ts';
import type { Spot } from '../../render/render-rooms.ts';
import { isTilted, turnedBy } from '../../render/render-tilt.ts';
import type { ViewOptions } from './view-options.ts';

/** Whether a card's diagram is drawn as a network: no other type chosen, nor a table or a view's own picture. */
export const aNetwork = (d: ViewOptions['diagram']): boolean =>
  !d || (d.choice.drawn === 'network' && !d.table && !d.picture);

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
