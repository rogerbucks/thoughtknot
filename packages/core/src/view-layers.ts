// A view described by six layers (editor spec §68, layout_concept_layers). Roger, 25 Oct 2026: "the data's dimensions,
// the filters, the layout strategy and its variables, the projection, the conditional formatting, and the painter".
// Each layer is read from its own lines and keys of the style graph, so each is changed alone:
// - dimensions: what a Diagram orders and lays its things by (`order`, `by`, `relationship`, `centre`);
// - filters: what a Filter keeps (filter-saved.ts), and which things a Diagram shows (`show`);
// - strategy: the layout options a Shown keeps (`layout_strategy` and its variables), and how Links are routed;
// - projection: the Diagram's type, and the Render's space: flat, 2.5D or 3D (render-choice.ts);
// - formatting: the Looks, Shows, Pictures, Arrows and Flows, which colour, show and move links, never a thing;
// - painter: the Render's painter.
// A view's own lines win over the whole graph's. The same six layers hold in 2D and in 3D. Host-free and pure.
import type { FilterKeep } from './filter-saved.ts';
import { savedFilterFor } from './filter-saved.ts';
import { layoutOptions } from './layouts/layout-options.ts';
import type { LayoutOptions } from './layouts/layout-options.ts';
import { renderFor } from './render-choice.ts';
import type { Painter, Space } from './render-choice.ts';
import { linksOf } from './style.ts';
import type { Arrows, Diagram, Flow, Look, Picture, Routing, Show, StyleGraph } from './style-graph.ts';
import type { TimelineShow } from './timeline.ts';
import { chosenDiagram } from './types.ts';

/** The six layers, in the order a view is built from them. */
export const VIEW_LAYERS = ['dimensions', 'filters', 'strategy', 'projection', 'formatting', 'painter'] as const;
/** One of the six layers. */
export type ViewLayer = (typeof VIEW_LAYERS)[number];

/** A view as its six layers. */
export interface ViewLayers {
  /** The properties and links that place its things: its order, the property it orders by, its tree, its centre. */
  dimensions: Pick<Diagram, 'order' | 'by' | 'relationship' | 'centre'>;
  /** What it keeps: its Filter's values, and for a timeline the things with a date or without one. */
  filters: { keep?: FilterKeep; show?: TimelineShow };
  /** How it is laid out: the strategy and its variables, and how its links are routed and merged. */
  strategy: { options: LayoutOptions; routing: Routing; merge: boolean };
  /** How its places are shown: its diagram type, or a plug-in's by its whole name, and its space. */
  projection: { type: string; space: Space };
  /** How its things and links look, without moving one: the lines of the style graph that hold in it. */
  formatting: { looks: Look[]; shows: Show[]; pictures: Picture[]; arrows: Arrows[]; flows: Flow[] };
  /** What paints it. */
  painter: Painter;
}

/** `view`, or the whole graph with none, as its six layers, each read from its own part of `style`. */
export function viewLayers(style: StyleGraph, view?: string): ViewLayers {
  const d = chosenDiagram(style, view),
    render = renderFor(style, view);
  // a line for the whole graph holds in each view too; a Look holds only in its own view or path
  const holds = <T extends { view?: string }>(xs: readonly T[]) =>
    xs.filter((x) => x.view === undefined || x.view === view);
  const dimensions: ViewLayers['dimensions'] = {};
  for (const k of ['order', 'by', 'relationship', 'centre'] as const)
    if (d?.[k] !== undefined) Object.assign(dimensions, { [k]: d[k] });
  const keep = savedFilterFor(style.filters, view);
  return {
    dimensions,
    filters: { ...(keep ? { keep } : {}), ...(d?.show ? { show: d.show } : {}) },
    strategy: {
      options: layoutOptions(view === undefined ? undefined : style.shown.get(view)?.layout),
      ...linksOf(style, view),
    },
    projection: { type: d?.plugin ?? d?.type ?? 'network', space: render.space },
    formatting: {
      looks: style.looks.filter((l) => view !== undefined && l.view === view),
      shows: holds(style.shows),
      pictures: holds(style.pictures),
      arrows: holds(style.arrows),
      flows: holds(style.flows),
    },
    painter: render.painter,
  };
}
