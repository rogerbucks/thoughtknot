// A view of the core's own, drawn as the card's drawing rather than a picture to look at (editor spec §68,
// projections_all_on). Its things and links are written as Graphviz writes them (view-parts.ts). So each is chosen,
// opened and centred by the same clicks as in a network.
import { CORE_DIAGRAMS_ID } from '@thoughtknot/core';
import type { Drawn, LayoutOptions } from '@thoughtknot/core';
import { viewOf, viewSupport } from '../../view-support.ts';
import type { DiagramShown, PluginPicture } from './type-strip';

/** `o` with a view of the core's own as its drawing, its picture marked live so it is not shown again apart. */
export function viewDrawn<O extends { drawn: Drawn; diagram?: DiagramShown }>(o: O): O {
  const p = o.diagram?.picture;
  if (!p || p.plugin !== CORE_DIAGRAMS_ID || !o.diagram) return o;
  return { ...o, drawn: pictureLive(p), diagram: { ...o.diagram, picture: { ...p, live: true } } };
}

/** A view of the core's own as the card's drawing: its SVG, as laid out again by the View menu (view_options_everywhere). */
export const pictureLive = (p: PluginPicture): Drawn => ({
  svg: p.svg,
  rankdir: 'LR',
  width: p.width,
  height: p.height,
});

/**
 * Whether `diagram` is drawn as a plug-in's picture from outside, or as a table: then the card has no View menu. A
 * view of the core's own has one, as every diagram type has (view_options_everywhere).
 */
export const noViewMenu = (diagram?: Pick<DiagramShown, 'table' | 'picture'>): boolean =>
  !!diagram?.table || (!!diagram?.picture && diagram.picture.plugin !== CORE_DIAGRAMS_ID);

/** A picture that can be drawn again with the View menu's layout options; null, not drawn (outside-diagrams.ts). */
export type RedrawnPicture = PluginPicture & { redraw?: (layout: Partial<LayoutOptions>) => Promise<string | null> };

/**
 * A view of the core's own laid out again by the View menu, as `layout` says. A view that lays things out itself, such
 * as Force, is drawn again. Any other is the same picture, which a lens then bends anew.
 */
export function pictureAgain(p?: RedrawnPicture, layout?: Partial<LayoutOptions>): Promise<Drawn> | undefined {
  if (!p) return undefined;
  const { redraw } = p;
  if (!redraw || !layout || viewSupport(viewOf(undefined, p.type), 'spacing') !== 'yes')
    return Promise.resolve(pictureLive(p));
  return redraw(layout).then((svg) => pictureLive(svg ? { ...p, svg } : p));
}
