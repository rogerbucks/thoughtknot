// The layouts a host offers besides our own (editor spec §68, layout_plugins). A host hands over its plug-in registry once
// its plug-ins are installed. The View menu then lists their layouts beside ours. A drawing whose options choose one is
// placed by it on the page, where the plug-in runs, before it goes to the layout worker. The spots go with the drawing
// as data, so the worker lays it out by them (own-engine.ts). A layout that fails or runs too long places nothing, and
// the drawing is laid out by its shape, saying so. It is never blank.
import type { GraphDrawing } from '../note-reading.ts';
import type { PluginResult } from '../plugin-calls.ts';
import type { LayoutGiven } from '../plugin-layouts.ts';
import type { GraphShape } from '../types-shape.ts';
import { word } from '../words.ts';
import { isPluginLayoutId, layoutOptions } from './layout-options.ts';

/** What a host offers: its registry's layouts, and its way to place a graph by one. */
export interface LayoutOffer {
  layouts: () => readonly { id: string; title: string }[];
  placeBy: (id: string, given: LayoutGiven) => Promise<PluginResult<Record<string, [number, number]>>>;
}

/**
 * One offer of the layouts of each registry `registries` gives, such as one for each plug-in running. A layout is
 * placed by the first registry that adds it.
 */
export function offerOf(registries: () => Iterable<LayoutOffer>): LayoutOffer {
  return {
    layouts: () => [...registries()].flatMap((r) => r.layouts()),
    placeBy: (id, given) => {
      for (const r of registries()) if (r.layouts().some((l) => l.id === id)) return r.placeBy(id, given);
      return Promise.resolve({ ok: false, plugin: '', message: word('plugins.none.layout', { name: id }) });
    },
  };
}

/** What the host offers now; none until it installs its plug-ins. */
let offer: LayoutOffer | null = null;

/** Offers the layouts of `registry`, in place of any offered before; null offers none. */
export function offerLayouts(registry: LayoutOffer | null): void {
  offer = registry;
}

/** The layouts plug-ins add, as the View menu lists them, after our own. */
export const offeredLayouts = (): { id: string; title: string }[] =>
  (offer?.layouts() ?? []).map(({ id, title }) => ({ id, title }));

/** The layout `strategy` as a person reads it: ours by its word, a plug-in's by its title, else its id. */
export function strategyName(strategy: string): string {
  if (strategy === 'auto' || strategy === 'rows' || strategy === 'spread')
    return word(`view.layout.strategy.${strategy}`);
  return offeredLayouts().find((l) => l.id === strategy)?.title ?? strategy;
}

/** Whether `drawing` chooses a plug-in's layout and has not been placed by it yet. */
export const needsPlacing = (drawing: GraphDrawing): boolean =>
  !drawing.placed && isPluginLayoutId(layoutOptions(drawing.layoutOptions).strategy);

/** The shape of `drawing` as a plug-in's layout is given it: each box a thing, each link between two of them. */
export function drawingShape(drawing: GraphDrawing): GraphShape {
  const keys = new Set(drawing.boxes.map((b) => b.key));
  return {
    things: drawing.boxes.map((b) => ({ key: b.key, text: b.text, kinds: b.kind ? [b.kind] : [] })),
    links: drawing.links
      .filter((l) => keys.has(l.from) && keys.has(l.to))
      .map((l) => ({ from: l.from, type: l.type, to: l.to })),
  };
}

/**
 * `drawing` with each thing's spot as the plug-in's layout its options choose places it. A layout not offered, that
 * fails or that runs too long gives no spots. Our engine then lays the drawing out by its shape, and says so.
 */
export async function placedFor(drawing: GraphDrawing): Promise<GraphDrawing> {
  const options = layoutOptions(drawing.layoutOptions);
  const r = offer
    ? await offer.placeBy(options.strategy, { shape: drawingShape(drawing), previous: {}, options, sizes: {} })
    : null;
  return { ...drawing, placed: r?.ok ? r.value : {} };
}
