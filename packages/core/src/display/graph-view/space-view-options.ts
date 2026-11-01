// What the 3D view of a card's drawing takes as it opens, and what an open one offers (editor spec §53). The view
// itself is space-view-panel.ts.
import type { Lens, MiniMapSetting, Painter } from '@thoughtknot/core';
import type { LayoutOptions } from '../../layouts/layout-options.ts';
import type { SpaceMove } from '../../space-controls.ts';
import type { Orbit } from '../../space-view.ts';
import type { GlobeDetails } from '../../space-globe.ts';
import type { Sketch } from './space-sketch.ts';

/** How the drawing is shown in space: as cards (2.5D), as balls (3D), or on a globe (§71, globe_view). */
export type SpaceMode = 'cards' | 'balls' | 'globe';

/** How the view opens: as cards, in 3D or on a globe; and whether each thing stays where its type drew it. */
export interface SpaceOptions {
  cards?: boolean;
  globe?: boolean; // on a globe, seen from outside (Roger, 31 Oct 2026)
  centre?: () => string | null; // the thing a globe faces you with first: the centre of an exploration (§71)
  details?: GlobeDetails; // each thing's properties, shown on the globe as you near it (globe_dive_detail)
  asDrawn?: boolean; // each thing kept where its diagram type drew it (space_follows_type)
  layout?: () => Partial<LayoutOptions> | undefined; // as the View menu spaces it (layout_saved_with_view)
  sketch?: () => Sketch | null; // the drawings over the graph as shown now, none while hidden (§70)
  miniMap?: () => MiniMapSetting; // whether its mini-map shows, as the flat drawing's does (space_mini_map)
  painter?: Painter; // the fastest that may paint it, as its style graph's Render says (layout_concept_layers)
  lens?: () => Lens | undefined; // what it is seen through, round the picked thing (projections_all_on)
  orbit?: Orbit; // drawn again in its card's place, the camera where the last left it (NEURO-7)
}

/** An open 3D view: how to close it, move it as the card's bar asks, and show it as cards, balls or a globe. */
export interface SpaceView {
  close: () => void;
  move: (m: SpaceMove) => void;
  as: (mode: SpaceMode) => void;
  orbit: () => Orbit; // where the camera is now, for a card drawn again in its place
}
