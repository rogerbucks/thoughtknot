// Names readable at any zoom in a 2D drawing (editor spec §3, names_readable_any_zoom), for the graph view's viewer-aids.ts. The view
// changes, and the names are sized again. Each scales with its thing up to NAME_CEILING pixels. With Hide labels too
// small to read on, one under SHOWN_LEAST is hidden. One that would then cover another is hidden (readable-words.ts). The drawing's own attributes are left as drawn: a name grows by its style, moves
// by its own transform, and is hidden by a class. So the lens, hit tests and export still see the drawing as laid out.
import { linkLeast, readableWords, type Box, type Shown, type Word } from '../../view-types/readable-words.ts';
import { make } from './note-callouts.ts';

/** The words whose size is kept readable: a thing's name, a group's and the drawing's own captions, such as an axis's.
 * A link's words follow labels by zoom. */
const NAMES = 'g.graph text';
/** The class of the count beside a name that stands for crowded names left out: "+3". */
export const MORE = 'thoughtknot-name-more';
/** The class of a name hidden for now, as it would cover another. */
export const CROWDED = 'thoughtknot-name-crowded';
/** What marks a thing to be named first: picked, under the pointer, or in focus. */
const FIRST = 'is-selected thoughtknot-hot thoughtknot-kept'.split(' ');

/** A name as drawn, read the first time it is sized. */
const drawn = new WeakMap<Element, Word>();

/** The box round the outline of thing `g` as drawn, from its first shape: an ellipse, rectangle, polygon or path. */
export function outlineOf(g: Element | null): { left: number; top: number; right: number; bottom: number } | null {
  const shape = g?.querySelector('ellipse, rect, polygon, path');
  if (!shape) return null;
  const n = (a: string) => Number(shape.getAttribute(a)) || 0;
  if (shape.tagName.toLowerCase() === 'ellipse')
    return { left: n('cx') - n('rx'), top: n('cy') - n('ry'), right: n('cx') + n('rx'), bottom: n('cy') + n('ry') };
  if (shape.tagName.toLowerCase() === 'rect')
    return { left: n('x'), top: n('y'), right: n('x') + n('width'), bottom: n('y') + n('height') };
  const v = (shape.getAttribute('points') ?? shape.getAttribute('d') ?? '')
    .match(/-?\d*\.?\d+(?:e-?\d+)?/gi)
    ?.map(Number);
  if (!v || v.length < 4) return null;
  const xs = v.filter((_, i) => i % 2 === 0),
    ys = v.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Whether a name at (`x`, `y`) lies inside its thing's outline `box`, so it grows with the box as you zoom in. */
const within = (box: ReturnType<typeof outlineOf>, x: number, y: number): boolean =>
  !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/** `text` as drawn, as a word of its group. */
function wordOf(text: Element, group: string): Word {
  let w = drawn.get(text);
  if (!w) {
    const a = text.getAttribute('text-anchor');
    w = {
      group,
      x: Number(text.getAttribute('x')) || 0,
      y: Number(text.getAttribute('y')) || 0,
      size: Number.parseFloat(text.getAttribute('font-size') ?? '') || 14,
      anchor: a === 'middle' || a === 'end' ? a : 'start',
      letters: [...(text.textContent ?? '')].length,
    };
    if (within(outlineOf(text.parentElement), w.x, w.y - w.size / 3)) w.inside = true;
    drawn.set(text, w);
  }
  return w;
}

/** The scale and shift of `svg`'s top group, read as lens-svg.ts's frameOf reads them. A point in the group is at
 * `s × (p + shift)` in the drawing's units. */
function frameOf(svg: SVGSVGElement): { s: number; tx: number; ty: number } {
  const t = svg.querySelector('g.graph')?.getAttribute('transform') ?? '';
  const [s = 1] = (/scale\(([^()]*)\)/.exec(t)?.[1] ?? '1').split(/[\s,]+/).map(Number);
  const [tx = 0, ty = 0] = (/translate\(([^()]*)\)/.exec(t)?.[1] ?? '0 0').split(/[\s,]+/).map(Number);
  return { s: s || 1, tx, ty };
}

/** How many screen pixels one unit of `svg`'s top group is, and the part of the group shown, in its own units. */
export function shownOf(svg: SVGSVGElement): { k: number; view: Box } | null {
  const [left = 0, top = 0, width = 0, height = 0] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const shown = Number.parseFloat(svg.getAttribute('width') ?? '');
  if (!(width > 0 && shown > 0)) return null;
  const { s, tx, ty } = frameOf(svg);
  const at = (x: number, y: number) => [x / s - tx, y / s - ty] as const;
  // zoomed in, the drawing grows past its viewport, which scrolls: only the part inside the viewport is shown
  const [x0 = left, y0 = top, x1 = left + width, y1 = top + height] = scrolledIn(svg, left, top, width, height);
  const [l, t] = at(x0, y0),
    [r, b] = at(x1, y1);
  return { k: (shown / width) * s, view: { left: l, top: t, right: r, bottom: b } };
}

/** The part of `svg`'s view box its scrolling viewport shows, as left, top, right, bottom; all of it when unknown. */
function scrolledIn(svg: SVGSVGElement, left: number, top: number, width: number, height: number): number[] {
  const all = [left, top, left + width, top + height];
  const port = svg.parentElement;
  if (typeof svg.getBoundingClientRect !== 'function' || !port || typeof port.getBoundingClientRect !== 'function')
    return all;
  const a = svg.getBoundingClientRect(),
    v = port.getBoundingClientRect();
  if (!(a.width > 0 && a.height > 0 && v.width > 0 && v.height > 0)) return all;
  const x = (px: number) => left + ((Math.min(Math.max(px, a.left), a.right) - a.left) / a.width) * width;
  const y = (py: number) => top + ((Math.min(Math.max(py, a.top), a.bottom) - a.top) / a.height) * height;
  return [x(v.left), y(v.top), x(v.right), y(v.bottom)];
}

/**
 * Sizes the names in `svg` for how large it is shown now. A thing with more of `links` is named first, and larger. With
 * `hideSmall`, a name too small to read is hidden.
 */
export function readableNames(
  svg: SVGSVGElement,
  links: readonly { from: string; to: string }[] = [],
  hideSmall = false,
): void {
  const at = shownOf(svg);
  if (!at) return;
  // a link never thins past reading, however far out; the style sheet reads this
  svg.setCssProps({ '--thoughtknot-link-least': `${linkLeast(at.k)}px` });
  for (const old of Array.from(svg.querySelectorAll(`.${MORE}`))) old.remove();
  // a name is a text straight in its thing's, its group's or the drawing's own element; a hidden thing's is left alone
  const texts = Array.from(svg.querySelectorAll(NAMES)).filter((t) => {
    const g = t.parentElement?.classList;
    return (
      !!g && (g.contains('node') || g.contains('cluster') || g.contains('graph')) && !g.contains('thoughtknot-hidden')
    );
  });
  // the rows of one thing's or group's name grow together; each of the drawing's captions alone
  const groups = texts.map(
    (t, i) => (t.parentElement?.classList.contains('graph') ? '' : t.parentElement?.id) || `#${i}`,
  );
  const first = [
    ...new Set(groups.filter((_, i) => FIRST.some((c) => texts[i]?.parentElement?.classList.contains(c)))),
  ];
  // how many links each thing has, by the group its name is in
  const count = new Map<string, number>();
  for (const l of links) {
    count.set(l.from, (count.get(l.from) ?? 0) + 1);
    if (l.to !== l.from) count.set(l.to, (count.get(l.to) ?? 0) + 1);
  }
  const many = new Map<string, number>();
  texts.forEach((t, i) => {
    const key = t.parentElement?.getAttribute('data-key');
    const n = key ? count.get(key) : undefined;
    if (n) many.set(groups[i] as string, n);
  });
  const shown = readableWords(
    texts.map((t, i) => wordOf(t, groups[i] as string)),
    at.k,
    first,
    at.view,
    many,
    hideSmall,
  );
  texts.forEach((t, i) => {
    const w = drawn.get(t) as Word,
      s = shown[i];
    if (s) shownAs(t, w, s);
    if (s?.more) counted(t, s);
  });
}

/** Beside the name `text`, a count of the crowded names it stands for, so none is simply lost. */
function counted(text: Element, s: Shown): void {
  if (!s.moreAt || !text.parentElement) return;
  const c = make('text', { x: s.moreAt.x, y: s.moreAt.y, 'font-size': s.moreAt.size, 'text-anchor': 'start' });
  c.setAttribute('class', MORE);
  c.setAttribute('aria-hidden', 'true');
  c.textContent = `+${s.more}`;
  text.parentElement.appendChild(c);
}

/** Names sized or moved here, so a name left as drawn is not touched at all. */
const changed = new WeakSet<Element>();
/** How near, in the drawing's units, counts as not moved. */
const STILL = 1e-6;

/** `text`, drawn as `w`, shown as `s`: grown by its style, moved by its own transform, hidden by a class. */
function shownAs(text: Element, w: Word, s: { size: number; x: number; y: number; hidden: boolean }): void {
  const dx = s.x - w.x,
    dy = s.y - w.y,
    moved = Math.abs(dx) > STILL || Math.abs(dy) > STILL;
  if (s.size !== w.size || moved) {
    changed.add(text);
    (text as SVGTextElement).setCssStyles({ fontSize: s.size !== w.size ? `${s.size}px` : '' });
    if (moved) text.setAttribute('transform', `translate(${dx} ${dy})`);
    else text.removeAttribute('transform');
  } else if (changed.has(text)) {
    changed.delete(text);
    (text as SVGTextElement).setCssStyles({ fontSize: '' });
    text.removeAttribute('transform');
  }
  if (s.hidden || text.hasClass(CROWDED)) text.toggleClass(CROWDED, s.hidden);
}
