// The levels of detail in the view in space (editor spec §68, level_space). Roger, 3 Nov 2026: 3D gets the same
// levels, clouds, roads and badge as 2D. So each time its camera moves, the clouds of the level that fits are drawn
// round the things as the camera sees them. They sit on a layer over its canvas that takes no pointer, so turning and
// picking in space work as before. Nothing moves.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import { make } from './note-callouts.ts';
import { levelsInto, levelsOf } from './level-clouds-svg.ts';
import type { SpaceScreen } from './space-view-options.ts';

/** The class of the layer the levels are drawn on, over the view in space. */
export const SPACE_LEVELS = 'thoughtknot-space-levels';

/** Draws the levels of `drawing` over the view in space as `screen` shows it. Gives back the badge, or null. */
export function levelSpace(screen: SpaceScreen, drawing: GraphDrawing | undefined, g?: Graph): string | null {
  const { width, height, el } = screen;
  let layer = Array.from(el.children).find((c) => c.classList.contains(SPACE_LEVELS)) as SVGSVGElement | undefined;
  if (!layer) {
    layer = make('svg', { class: `thoughtknot-svg ${SPACE_LEVELS}`, 'aria-hidden': 'true' });
    layer.appendChild(make('g', { class: 'graph' }));
    el.appendChild(layer);
  }
  layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const top = layer.firstElementChild ?? layer;
  const levels = drawing ? levelsOf(drawing, g) : [];
  return levelsInto(layer, top, levels, drawing, screen.boxes(), {
    k: 1,
    view: { left: 0, top: 0, right: width, bottom: height },
  });
}
