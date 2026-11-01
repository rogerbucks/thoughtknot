// What the overview of a graph too large to draw needs from its host, and what it gives back (editor spec §53,
// massive-view.ts). Kept apart so the overview itself stays short.
import type { Drawn, GraphDrawing, Painter, Refusal, RulesShown } from '@thoughtknot/core';
import type { FilterKeep } from '../../filter-saved.ts';
import type { Palette } from '../../palette.ts';
import type { FlyView, Match } from '../../search-fly.ts';
import type { PainterKind } from './mark-painter.ts';

/** What the overview needs from its host. */
export interface MassiveOptions {
  graph: string;
  /** The host's colours, as its drawings name them. */
  palette: Palette;
  /** Lays out a part of the graph, as the card's drawings are laid out: in the worker, under the same limits. */
  layout: (part: GraphDrawing, owner: object) => Promise<Drawn | Refusal | null>;
  /** A thing's properties by its key, for the filters. Not set: things filter by kind alone. */
  props?: (key: string) => Readonly<Record<string, unknown>>;
  /** The filter the overview starts with, as saved. Not set: everything is kept. */
  chosen?: FilterKeep;
  /** Told each filter the user chooses, to save it. Going back or forward is not a choice. */
  chose?: (keep: FilterKeep) => void;
  /** Told the thing chosen: found by search, even in a group too large to draw, or clicked in an opened group. */
  picked?: (key: string) => void;
  painter?: Painter; // the fastest that may paint it, as the style graph's Render says (layout_concept_layers)
  /** What the style graph's rules give its things: each group box counts its looks, and the filters offer them (§56). */
  rules?: Pick<RulesShown, 'things' | 'legend'>;
}

/** The overview on screen: how to close it, its painter, where it looks, and how to find and fly to a thing. */
export interface MassiveView {
  close(): void;
  painter(): PainterKind | null;
  view(): FlyView;
  find(query: string): Match[];
  flyTo(match: Match): Promise<void>;
}
