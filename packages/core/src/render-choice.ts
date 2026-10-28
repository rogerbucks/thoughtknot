// How a view is put on the screen, set in the style graph (editor spec §68, layout_concept_layers). Roger, 25 Oct 2026:
// a view is six layers, and two of them are here. A Render line sets them for the whole graph or one view:
// - its space: flat (2D), cards in space (2.5D) or balls in space (3D), part of the projection layer;
// - its painter: the device's best, or one no faster than it names, the painter layer.
// Each key is changed alone. A view's own Render wins, key by key, over the whole graph's; the first written is used.
// Host-free and pure.
import type { StyleAt } from './style-graph.ts';

/** The spaces a view is shown in: flat, as cards in space, or as balls in space. */
export const SPACES = ['2d', '2.5d', '3d'] as const;
/** One of the spaces. */
export type Space = (typeof SPACES)[number];

/** The painters a view may be painted by: the device's best, then each from the fastest (mark-painter.ts). */
export const PAINTERS = ['auto', 'webgpu', 'webgl2', 'canvas'] as const;
/** One of the painters. */
export type Painter = (typeof PAINTERS)[number];

/** A Render line: the space a view is shown in, its painter, or both; for the whole graph, or for one view. */
export interface Render {
  space?: Space;
  painter?: Painter;
  /** The view it is chosen for; none, the whole graph. */
  view?: string;
  at: StyleAt;
}

/** The space and painter of `view`, or of the whole graph with none: the view's own first, each key alone. */
export function renderFor(style: { renders: readonly Render[] }, view?: string): { space: Space; painter: Painter } {
  const first = <K extends 'space' | 'painter'>(k: K) =>
    (view === undefined ? undefined : style.renders.find((r) => r.view === view && r[k] !== undefined)?.[k]) ??
    style.renders.find((r) => r.view === undefined && r[k] !== undefined)?.[k];
  return { space: first('space') ?? '2d', painter: first('painter') ?? 'auto' };
}

/** How a card opens in `space`: flat (null), as cards in space (2.5D) or as balls in space (3D). */
export const spaceMode = (space?: Space): 'cards' | 'balls' | null =>
  space === '2.5d' ? 'cards' : space === '3d' ? 'balls' : null;

/** The makers to try for `painter`, from `makers` in the order of PAINTERS: the one named, then each slower one. */
export const paintersFrom = <M>(painter: Painter | undefined, makers: readonly M[]): readonly M[] =>
  makers.slice(Math.max(0, PAINTERS.indexOf(painter ?? 'auto') - 1));
