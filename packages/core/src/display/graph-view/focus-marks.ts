// Focus, filters and the highlight put on the drawing (editor spec §25). The core says what is kept at full strength,
// hidden or highlighted. That becomes a class on each box and link of the SVG Graphviz drew. `styles.css` does the
// rest. Only classes change, never an attribute that places or sizes anything, so nothing moves and nothing is laid out
// again.
import type { FocusTarget, Kept } from '@thoughtknot/core';
import { PALETTES } from '../../palette.ts';
import { drawnOf, queryLabel, queryLine } from '../../query-marks.ts';
import type { Marked, QueryMarkDrawn } from '../../query-marks.ts';

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

/**
 * What the drawing is to show: what stays at full strength (null: all of it), what is hidden and what is highlighted.
 * Then what a query shown as a highlight marks (ES§75), if one is shown.
 */
export interface Marks {
  kept: Kept | null;
  hidden: Kept;
  hot: Kept | null;
  marked?: Marked;
}

/** The class on a thing a query's highlight marks, which `styles.css` rings in the highlight's colour. */
export const QUERY_MARKED = 'thoughtknot-query-marked';
/** The class of a highlight's badge on a thing, which the 3D view reads too (svg-marks.ts). */
export const QUERY_BADGE = 'thoughtknot-query-badge';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The numbers in an attribute of `el`, such as a polygon's points. */
const numbersIn = (el: Element | null, name: string) =>
  (el?.getAttribute(name) ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

/**
 * Marks the box group `g` with a highlight's mark `d`, or takes it off for null. The ring is the outline's colour and
 * weight (styles.css). The badge is a sign at the box's top right corner, clear of a rule's badge at its top left.
 * Both sit on the box as it is: no attribute that places or sizes the box is touched.
 */
export function markQuery(g: Element, d: QueryMarkDrawn | null): void {
  const kids = Array.from(g.children);
  const child = (...tags: string[]) => kids.find((c) => tags.includes(c.tagName.toLowerCase())) ?? null;
  const had = kids.find((c) => c.classList.contains(QUERY_BADGE));
  if (g.getAttribute('data-query-badge') === (d?.glyph ?? null) && (!d || had)) return;
  had?.remove();
  g.classList.toggle(QUERY_MARKED, !!d);
  const style = (g as Element & { style?: CSSStyleDeclaration }).style;
  if (!d) {
    g.removeAttribute('data-query-badge');
    style?.removeProperty('--thoughtknot-query-line');
    style?.removeProperty('--thoughtknot-query-label');
    return;
  }
  g.setAttribute('data-query-badge', d.glyph);
  style?.setProperty('--thoughtknot-query-line', queryLine(d.hue, PALETTES.obsidian));
  style?.setProperty('--thoughtknot-query-label', queryLabel(d.hue, PALETTES.obsidian));
  const shape = child('path', 'polygon', 'ellipse');
  const tag = shape?.tagName.toLowerCase();
  let x: number | undefined, y: number | undefined;
  if (tag === 'ellipse') {
    const [cx = 0, cy = 0, rx = 0, ry = 0] = ['cx', 'cy', 'rx', 'ry'].map((n) => numbersIn(shape ?? null, n)[0]);
    [x, y] = [cx + rx * 0.7, cy - ry * 0.7 + 10];
  } else if (shape) {
    const all = numbersIn(shape, tag === 'path' ? 'd' : 'points');
    if (all.length >= 4) {
      x = Math.max(...all.filter((_, i) => i % 2 === 0)) - 4;
      y = Math.min(...all.filter((_, i) => i % 2 === 1)) + 10;
    }
  } else {
    // a thing drawn as its name alone has no outline to ring: its badge sits just above its name
    const name = child('text');
    [x, y] = [numbersIn(name, 'x')[0], (numbersIn(name, 'y')[0] ?? 12) - 12];
  }
  if (x === undefined || y === undefined) return;
  const badge = g.appendChild(g.ownerDocument.createElementNS(SVG_NS, 'text'));
  // with no outline to ring, the badge itself takes the colour, in the label blend, as it sits on the page
  badge.setAttribute('class', shape ? QUERY_BADGE : `${QUERY_BADGE} ${QUERY_BADGE}-bare`);
  badge.setAttribute('x', String(x));
  badge.setAttribute('y', String(y));
  badge.setAttribute('text-anchor', shape ? 'end' : 'middle');
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = d.glyph;
}

/**
 * The place among the drawing's links of a link's element, from its id in the SVG (`edge3` is the third, so 2). A link
 * merged into a trunk (§25) has a second line to the trunk, `edge3_tail`, which is the same link.
 */
export function edgeNumber(g: Element): number {
  const n = /^edge(\d+)(?:_tail)?$/.exec(g.getAttribute('id') ?? '')?.[1];
  return n === undefined ? -1 : Number(n) - 1;
}

/** The thing or link an element of the drawing belongs to, if any. */
export function focusTargetOf(el: EventTarget | null): FocusTarget | null {
  const near = el as Element | null;
  const key = near?.closest?.('g.node')?.getAttribute('data-key');
  if (key) return { thing: key };
  const edge = near?.closest?.('g.edge');
  const n = edge ? edgeNumber(edge) : -1;
  return n >= 0 ? { edge: n } : null;
}

/** Whether two are the same thing or the same link. */
export function sameTarget(a: FocusTarget | null, b: FocusTarget | null): boolean {
  if (!a || !b) return a === b;
  if ('thing' in a) return 'thing' in b && a.thing === b.thing;
  return 'edge' in b && a.edge === b.edge;
}

/**
 * The boxes and links of one drawing, found once, and marked as the drawing is to look. `thoughtknot-hidden` marks what
 * is hidden. With something kept, `thoughtknot-kept` marks what stays at full strength and `thoughtknot-dim` what
 * fades. What is highlighted comes forward under the pointer (`thoughtknot-hot`) over any focus. The focus itself is as
 * it was when the highlight goes. A change of highlight marks only the things it touched. What a query's highlight
 * marks gets a ring and a badge (`markQuery`), by the one mark rule (query-marks.ts).
 */
export class DrawingMarks {
  private readonly svg: Element;
  private readonly nodes = new Map<string, Element>();
  /** Each link's lines: one, or two for a link merged into a trunk. */
  private readonly edges = new Map<number, Element[]>();

  /** For a drawing's SVG, whose boxes and links are looked up once. */
  constructor(svg: Element) {
    this.svg = svg;
    // a fold's stub, box or trunk (§25) is no thing or link of the graph, so focus never marks it
    for (const g of Array.from(svg.querySelectorAll('g.node[data-key]')))
      this.nodes.set(g.getAttribute('data-key') ?? '', g);
    for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
      const n = edgeNumber(g);
      if (n >= 0) this.edges.set(n, [...(this.edges.get(n) ?? []), g]);
    }
  }

  /** Marks every box and link. */
  all(m: Marks): void {
    for (const [key, g] of this.nodes) {
      this.mark(g, m, m.hidden.things.has(key), !!m.kept?.things.has(key), !!m.hot?.things.has(key));
      markQuery(g, drawnOf(m.marked?.get(key)));
    }
    for (const [n, gs] of this.edges)
      for (const g of gs) this.mark(g, m, m.hidden.edges.has(n), !!m.kept?.edges.has(n), !!m.hot?.edges.has(n));
    // the 3D view of the drawing, if open, shows what it hides and brings forward too (space-view-panel.ts)
    tellChanged(this.svg, 'look');
  }

  /** Marks only these boxes (by key) and links (by place), as `m` says: the ones a change of highlight touched. */
  some(m: Marks, things: Iterable<string>, links: Iterable<number>): void {
    for (const key of things) {
      const g = this.nodes.get(key);
      if (g) this.mark(g, m, m.hidden.things.has(key), !!m.kept?.things.has(key), !!m.hot?.things.has(key));
    }
    for (const n of links)
      for (const g of this.edges.get(n) ?? [])
        this.mark(g, m, m.hidden.edges.has(n), !!m.kept?.edges.has(n), !!m.hot?.edges.has(n));
  }

  private mark(g: Element, m: Marks, hidden: boolean, kept: boolean, hot: boolean): void {
    g.classList.toggle('thoughtknot-hidden', hidden);
    g.classList.toggle('thoughtknot-kept', !!m.kept && kept);
    g.classList.toggle('thoughtknot-dim', !!m.kept && !kept && !hot);
    g.classList.toggle('thoughtknot-hot', hot);
  }
}

/** Marks the links of the thing `key` among `links`, and only those, drawn a little thicker (Roger, 25 Oct 2026). */
export function markTouching(svg: Element, links: readonly { from: string; to: string }[], key: string | null): void {
  const touching = new Set(
    links.flatMap((l, n) => (key !== null && (l.from === key || l.to === key) ? [String(n)] : [])),
  );
  for (const g of Array.from(svg.querySelectorAll('g.edge')))
    g.classList.toggle('thoughtknot-touching', touching.has(g.getAttribute('data-link') ?? ''));
}
