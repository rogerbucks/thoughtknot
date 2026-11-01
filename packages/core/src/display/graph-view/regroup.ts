// A thing and its neighbours laid out together (editor spec §25, untangle_regroup). Shown only with its neighbours, a
// thing's graph is laid out again with just them, so they sit together, fitted to the card. Shown whole again, it is
// laid out as it was, at the zoom it had. Meanwhile the card keeps its height, so the note does not jump. Each box
// drawn before and after glides from where it was on the screen to where it is now. The links drawn fade in. It is
// brief, and at once when the system asks for reduced motion (motion_reduced_respected). Only a shift and the
// opacity move, for the length of the glide: nothing that places a box is changed. Nothing here reaches the note.
import type { Kept, Size, View, Zoom } from '@thoughtknot/core';
import { reducedMotion } from './details-nav.ts';
import type { ViewSwitching } from './view-switches';
import { boxIn } from './taps.ts';

/** How long the boxes take to glide to their new places, in milliseconds. */
const GLIDE_MS = 360;

/** Where each box of the drawing is on the screen now, by its thing's key. */
export function boxPlaces(svg: SVGSVGElement | null): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>();
  for (const g of Array.from(svg?.querySelectorAll('g.node[data-key]') ?? [])) {
    const r = g.getBoundingClientRect();
    if (r.width) out.set(g.getAttribute('data-key') ?? '', r);
  }
  return out;
}

/** The middle of a rectangle on the screen. */
const middle = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Glides each box in `svg` drawn before too from where it was (`was`), and fades in the links. */
export function glideBoxes(svg: SVGSVGElement | null, was: Map<string, DOMRect>): void {
  if (!svg || !was.size || reducedMotion(svg.win)) return;
  const timing = { duration: GLIDE_MS, easing: 'ease-out' };
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.node[data-key]'))) {
    const from = was.get(g.getAttribute('data-key') ?? ''),
      to = g.getBoundingClientRect(),
      // the screen's pixels in one of the drawing's units: a box is moved in the drawing's units
      unit = to.width / (g.getBBox?.().width || to.width || 1);
    if (!from || !to.width || typeof g.animate !== 'function') continue;
    const a = middle(from),
      b = middle(to),
      dx = (a.x - b.x) / unit,
      dy = (a.y - b.y) / unit;
    g.animate([{ translate: [dx, dy].map((n) => `${n}px`).join(' ') }, { translate: '0px 0px' }], timing);
  }
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.edge')))
    if (typeof g.animate === 'function') g.animate([{ opacity: 0 }, { opacity: 1 }], timing);
}

/** What regrouping needs of its card. */
export interface RegroupHost {
  svg: () => SVGSVGElement | null;
  zoom: () => Zoom;
  /** The View menu, which lays the graph out again; none for a card that cannot, such as a table. */
  switching: () => ViewSwitching | null;
  /** The viewport's size to draw it at. */
  size: () => Size;
}

/** The regrouping of one card: the view and height it had before, while it is regrouped. */
export class Regrouping {
  private readonly host: RegroupHost;
  private before: { view: View; height: number } | null = null;

  constructor(host: RegroupHost) {
    this.host = host;
  }

  /** A size kept at least as tall as the card was before it was regrouped. A size of none stays none. */
  held(size: Size): Size {
    const h = this.before?.height ?? 0;
    return size.width && size.height < h ? { width: size.width, height: h } : size;
  }

  /**
   * Lays the graph out again with only what `only` keeps, fitted to the card. Or the whole graph again (null), at the
   * zoom it had before. A card that cannot be laid out again keeps the rest hidden in place, as before.
   */
  to(only: Kept | null): void {
    const sw = this.host.switching(),
      svg = this.host.svg();
    if (!sw || !svg) return;
    const back = only ? null : this.before;
    if (only) this.before ??= { view: this.host.zoom().view(), height: this.host.size().height };
    else this.before = null;
    const was = boxPlaces(svg);
    sw.regroup(only, () => {
      const zoom = this.host.zoom();
      if (back) zoom.restore(back.view.scale, back.view.x, back.view.y);
      else zoom.fit();
      glideBoxes(this.host.svg(), was);
    });
  }
}

/** The element that shows the fold `fold` now: a folded group's box, an opened group's outline, or a hub's stub or box. */
function shownAs(svg: SVGSVGElement, fold: string): Element | undefined {
  const all = Array.from(svg.querySelectorAll('[data-fold], [data-refold]'));
  const box = all.find((e) => e.getAttribute('data-fold') === fold && !e.matches('.thoughtknot-fold-back'));
  const opened = all.find((e) => e.getAttribute('data-refold') === fold);
  return box ?? opened ?? (fold.startsWith('hub:') ? boxIn(svg, fold.slice(4)) : undefined);
}

/** The middle of an element on the screen. */
const middleOf = (e: Element) => middle(e.getBoundingClientRect());

/**
 * Opens or folds back `fold` where it is on the screen (cluster_in_place): a group, or a hub's links. The View menu
 * `sw` lays the drawing out again. Then the zoom is kept, and the view moved so what shows the fold now sits where it
 * was. The rest glide from where they were: a group's things from its box. Then `focus` takes the keyboard to the
 * fold's first thing. A group's name (`zoom:` and its label) zooms to the group instead.
 */
export function foldInPlace(
  svg: SVGSVGElement | null,
  zoom: Zoom,
  fold: string,
  sw: ViewSwitching | null,
  focus?: false | ((key: string) => void),
): void {
  const run = (then: () => void) => sw?.unfold(fold, (key) => (then(), focus && focus(key)));
  if (fold.startsWith('zoom:')) return zoomToGroup(svg, zoom, `group:${fold.slice(5)}`);
  const el = svg && shownAs(svg, fold);
  if (!svg || !el || fold.startsWith('bundle:')) return run(() => undefined);
  const at = middleOf(el),
    was = boxPlaces(svg),
    scale = zoom.view().scale;
  const rect = el.getBoundingClientRect();
  for (const key of el.getAttribute('data-keys')?.split(' ') ?? []) if (!was.has(key)) was.set(key, rect);
  run(() => {
    const now = shownAs(svg, fold);
    if (!now) return;
    const v = zoom.view();
    if (v.scale !== scale) zoom.restore(scale, v.x, v.y);
    const to = middleOf(now);
    zoom.panBy(at.x - to.x, at.y - to.y);
    // an opened group too near an edge to show whole comes in as far as it fits
    const r = now.getBoundingClientRect(),
      vp = svg.parentElement?.getBoundingClientRect();
    if (vp) zoom.panBy(intoView(r.left, r.right, vp.left, vp.right), intoView(r.top, r.bottom, vp.top, vp.bottom));
    glideBoxes(svg, was);
  });
}

/** How far to move a span from `a` to `b` to lie within `lo` to `hi`: its start shows first, where it cannot fit. */
function intoView(a: number, b: number, lo: number, hi: number): number {
  if (a < lo) return lo - a;
  return b > hi ? Math.max(hi - b, lo - a) : 0;
}

/** How much of the view a group zoomed to fills, at most, across or down. */
const ZOOMED_FILLS = 0.9;

/** Zooms the view so the opened group `fold` (`group:` and its label) fills it, in its middle (cluster_fold_back). */
function zoomToGroup(svg: SVGSVGElement | null, zoom: Zoom, fold: string): void {
  const el = svg && shownAs(svg, fold),
    vp = svg?.parentElement?.getBoundingClientRect();
  if (!el || !vp?.width || !vp.height) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  zoom.panBy(vp.left + vp.width / 2 - (r.left + r.width / 2), vp.top + vp.height / 2 - (r.top + r.height / 2));
  zoom.zoomAt(ZOOMED_FILLS * Math.min(vp.width / r.width, vp.height / r.height), vp.width / 2, vp.height / 2);
}
