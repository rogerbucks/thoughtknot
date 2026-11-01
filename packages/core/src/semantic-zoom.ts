// Semantic zoom (editor spec §68, projection_semantic_zoom). Roger, 25 Oct 2026: far out each group is a box with its
// count, nearer its things show, and nearest their properties. Each step is drawn as its own picture, not only scaled.
// It is picked as a lens. It moves nothing a view drew, but steps the ladder of detail as the person zooms.
//
// How near is told by how many things fit on screen at the zoom: the screen, over the room a thing takes at that scale.
// It counts by the scale alone, not by the drawing. So each rung, a picture of its own size, counts the same, and a new
// picture never steps it again. It only steps the way the person zooms: in for more detail, out for less. It steps only
// past a margin, so it never flickers between two rungs. Nothing changes while the person does not zoom: it is never
// disorienting (ethos principle 8).
// Host-free and pure.
import { OVERVIEW_THINGS } from './view-switches.ts';

/** The rungs of semantic zoom, far to near: the ladder of detail, then every thing's properties shown. */
export const SEMANTIC_RUNGS = ['overview', 'groups', 'all', 'properties'] as const;
/** A rung of semantic zoom. */
export type SemanticRung = (typeof SEMANTIC_RUNGS)[number];

/** The most things on screen with every link apart; more, and links are bundled between groups. */
export const SEMANTIC_ALL = 25;
/** The most things on screen with every property shown. */
export const SEMANTIC_PROPERTIES = 12;
/** The room a thing takes in a drawing, with the space round it, in the drawing's units at natural size: 200 × 100. */
export const THING_ROOM = 200 * 100;
/** How far past a rung's edge the count must go before it steps: a quarter. */
export const SEMANTIC_MARGIN = 1.25;

/** How many of `things` fit on `screen`, in pixels, at `scale`: never more than there are. */
export function thingsSeen(things: number, scale: number, screen: { width: number; height: number }): number {
  return scale > 0 ? Math.min(things, (screen.width * screen.height) / (THING_ROOM * scale * scale)) : things;
}

/** The rung for `seen` things on screen, with no margin. */
export function rungFor(seen: number): SemanticRung {
  if (seen > OVERVIEW_THINGS) return 'overview';
  if (seen > SEMANTIC_ALL) return 'groups';
  return seen > SEMANTIC_PROPERTIES ? 'all' : 'properties';
}

/**
 * The rung to show with `seen` things on screen, on `was`, zoomed `way`: in (1), out (-1), or just picked (0). Zoomed
 * in, it only steps to more detail, and zoomed out to less, each past the margin. Just picked, the rung that fits.
 */
export function semanticStep(seen: number, was: SemanticRung, way: -1 | 0 | 1): SemanticRung {
  if (way === 0) return rungFor(seen);
  const to = rungFor(way > 0 ? seen * SEMANTIC_MARGIN : seen / SEMANTIC_MARGIN),
    by = SEMANTIC_RUNGS.indexOf(to) - SEMANTIC_RUNGS.indexOf(was);
  return by * way > 0 ? to : was;
}
