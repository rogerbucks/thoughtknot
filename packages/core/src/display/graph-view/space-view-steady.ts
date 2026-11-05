// The view in space kept steady as it moves (editor spec §53 and §68). Roger, 5 Nov 2026: the nightly was nowhere near
// as clear or well behaved as the mockups. So the globe's camera stays above its ground. The plane lies under 2.5D and
// 3D. A frame is painted again when its level changes, so it never stays blank.
import type { SpaceFrame } from '../../space-cards.ts';
import { groundGrid } from '../../space-ground.ts';
import { zoomGlobe } from '../../space-globe.ts';
import type { GlobeOf } from '../../space-globe.ts';
import { zoomBy } from '../../space-view.ts';
import type { Orbit, SpaceMarks } from '../../space-view.ts';

/** `orbit` zoomed by `times`: on a `globe`, toward its ground and never under it (globe_ground). */
export function zoomIn(orbit: Orbit, times: number, globe: GlobeOf | undefined): Orbit {
  return globe ? zoomGlobe(orbit, globe, times) : zoomBy(orbit, times);
}

/** `frame` with the faint plane under `shown`, as `matrix` sees it, unless it lies on a globe (space_ground). */
export function grounded(
  frame: SpaceFrame,
  shown: SpaceMarks,
  onGlobe: boolean,
  matrix: Float32Array,
  width: number,
  height: number,
): SpaceFrame {
  return onGlobe ? frame : { ...frame, ground: groundGrid(shown, matrix, width, height) };
}

/**
 * Watches `el` for the clouds of a level coming or going. The levels are drawn a frame after a move. So when they
 * change from clouds to every item, or back, it calls `again` to paint once more. Gives back what to call after each
 * paint.
 */
export function repaintOnLevel(el: HTMLElement, again: () => void): () => void {
  const far = () => !!el.querySelector('svg.thoughtknot-far');
  let painted = false;
  new MutationObserver(() => {
    if (far() !== painted) again();
  }).observe(el, { attributes: true, attributeFilter: ['class'], subtree: true });
  return () => {
    painted = far();
  };
}

/** The faint grid on the floor, under all else painted here, in the text's colour (space_ground). */
export function paintGround(ctx: CanvasRenderingContext2D, ground: readonly { x: number; y: number }[][], ink: string) {
  if (!ground.length) return;
  ctx.save();
  ctx.globalAlpha = GROUND_SHADE;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const run of ground) run.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/** How strong the grid on the floor is: faint, so it guides the eye and never competes with the drawing. */
const GROUND_SHADE = 0.1;
