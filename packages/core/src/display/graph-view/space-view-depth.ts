// The ways to show the view in space (editor spec §53): as cards, as balls, lifted, or on a globe (§71). Taken out of
// space-view-panel.ts so it stays a size to read.
import type { DrawMark } from '../../drawing-marks.ts';
import type { DepthBy } from '../../space-view.ts';
import type { SpaceMode } from './space-view-options.ts';

/** Where the globe is among the ways to show the view: the last, after cards, balls and the two lifts. */
export const GLOBE = 4;

/** The way to show the view for the bar's `mode`: as cards, a globe, or 3D balls, lifted as its own button left it. */
export const depthFor = (mode: SpaceMode, now: number): number =>
  mode === 'cards' ? 0 : mode === 'globe' ? GLOBE : now % GLOBE === 0 ? 1 : now;

/**
 * A way to show the view: as cards (the first, Roger, 24 Oct 2026), as balls in space (null), or on a globe (§71).
 * Or lifted, with height by what DepthBy says.
 */
export type Depth = DepthBy | 'cards' | 'globe' | null;

/** How `marks` shown `by` that way are lifted as they lie; none to lay them out afresh. So too a drawing of no things,
 * as a density view's squares, which has nothing to lay out (space_density_tiles). */
export const liftOf = (by: Depth, marks: readonly DrawMark[]): DepthBy | null =>
  by && by !== 'cards' && by !== 'globe' ? by : marks.some((m) => m.of !== undefined) ? null : { by: 'group' };
