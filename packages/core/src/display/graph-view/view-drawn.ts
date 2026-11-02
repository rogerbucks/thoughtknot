// A view of the core's own, drawn as the card's drawing rather than a picture to look at (editor spec §68,
// projections_all_on). Its things and links are written as Graphviz writes them (view-parts.ts). So each is chosen,
// opened and centred by the same clicks as in a network.
import { CORE_DIAGRAMS_ID } from '@thoughtknot/core';
import type { Drawn, GraphDrawing, LayoutOptions } from '@thoughtknot/core';
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

/**
 * A picture that can be drawn again: with the View menu's layout options, and of the drawing as its folds fold it.
 * Null, not drawn (outside-diagrams.ts).
 */
export type RedrawnPicture = PluginPicture & {
  redraw?: (layout?: Partial<LayoutOptions>, folded?: GraphDrawing) => Promise<string | null>;
};

/** What the View menu holds that a picture is drawn again by: its layout options, and how it folds a drawing. */
export interface PictureMenu {
  layout: Partial<LayoutOptions>;
  folded: (d: GraphDrawing, card?: object) => GraphDrawing;
}

/**
 * A view of the core's own laid out again by the View menu `menu`. It is drawn again of `drawing` as the menu folds it:
 * its hubs, groups and merged links (view_options_everywhere). A view that lays things out itself, such as Force, is
 * spaced as the menu says too. With no menu, it is the same picture, which a lens bends anew.
 */
export function pictureAgain(
  p?: RedrawnPicture,
  menu?: PictureMenu,
  drawing?: GraphDrawing,
  card?: object,
): Promise<Drawn> | undefined {
  if (!p) return undefined;
  const { redraw } = p;
  if (!redraw || !menu) return Promise.resolve(pictureLive(p));
  const spaced = viewSupport(viewOf(undefined, p.type), 'spacing') === 'yes' ? menu.layout : undefined;
  if (!spaced && !drawing) return Promise.resolve(pictureLive(p));
  const folded = drawing && menu.folded(drawing, card);
  return redraw(spaced, folded).then((svg) => pictureLive(svg ? { ...p, svg } : p));
}
