// One "changed" signal for every surface that shows a card's drawing (view_options_everywhere). The flat drawing, the
// view in space (2.5D, 3D, globe), its mini-map and the lens all listen to it. It says what changed, so each does only
// what that change needs. A new lens bends what is shown: the view in space paints it again, nothing laid out anew.
// A new look, layout or set of marks, or new drawings over the graph, is laid out again where it is shown.

/** The event the drawing's SVG sends once something it shows has changed. */
export const MARKED = 'thoughtknot-marked';

/** What changed: its marks or layout ('look'), the lens it is seen through, or the drawings over it. */
export type ViewChange = 'look' | 'lens' | 'sketch';

/** Tells every surface showing the drawing that `what` changed. */
export function tellChanged(drawing: EventTarget, what: ViewChange): void {
  drawing.dispatchEvent(new CustomEvent<ViewChange>(MARKED, { detail: what }));
}

/** What a change told changed; a change that does not say is taken as a new look, so all is laid out again. */
export function changeOf(e: Event): ViewChange {
  const what = (e as CustomEvent<unknown>).detail;
  return what === 'lens' || what === 'sketch' ? what : 'look';
}
