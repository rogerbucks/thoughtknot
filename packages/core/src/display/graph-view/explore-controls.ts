// The controls of an exploration on the card (editor spec §71). Roger, 31 Oct 2026: the controls sit on screen, with
// no menu to open. The banner says what is explored and holds its controls: the whole graph again, a step further out
// or nearer, Back, Next and the shape. Each shown thing with neighbours waiting has a badge on its box, its own target,
// which opens its branch; an open branch's badge closes it. Cross-links are marked, to be drawn faint and dashed.
import { word } from '@thoughtknot/core';
import type { FocusEdge } from '@thoughtknot/core';
import type { ExploreSession } from '../../explore-session.ts';
import { EXPLORE_SHAPES } from '../../layouts/explore-shapes.ts';
import type { BannerRow } from './untangle-banner';

/** What the controls ask of their card. */
export interface ExploreActs {
  /** Draws the exploration again, after a change. */
  changed: () => void;
  /** Leaves the exploration and shows the whole graph. */
  stop: () => void;
  /** A thing's name, by its key. */
  text: (key: string) => string;
}

/** The banner's line for `s`: what it shows, and its controls. */
export function exploreRow(s: ExploreSession, acts: ExploreActs): BannerRow {
  const run = (change: () => boolean) => () => {
    if (change()) acts.changed();
  };
  const next = EXPLORE_SHAPES[(EXPLORE_SHAPES.indexOf(s.shape) + 1) % EXPLORE_SHAPES.length] ?? 'balanced';
  return {
    words: word('explore.showing', { thing: acts.text(s.centre), count: s.keys().length }),
    actions: [
      { label: word('explore.stop'), run: acts.stop },
      { label: word('explore.deeper'), run: run(() => s.toDepth(s.depth + 1)) },
      ...(s.depth > 1 ? [{ label: word('explore.nearer'), run: run(() => s.toDepth(s.depth - 1)) }] : []),
      ...(s.canBack ? [{ label: word('explore.back'), run: run(() => s.back()) }] : []),
      ...(s.canNext ? [{ label: word('explore.next'), run: run(() => s.next()) }] : []),
      {
        label: word('explore.shape', { shape: word(`explore.shape.${s.shape}`) }),
        run: run(() => s.setShape(next)),
      },
    ],
  };
}

/** The SVG namespace, for the badges drawn into the drawing. */
const SVG = 'http://www.w3.org/2000/svg';
/** A badge's radius, in the drawing's units: 12 across, so a finger finds it with the box's edge (24 px at 1x). */
const BADGE_R = 12;

/**
 * Puts a badge on each box of `svg` that `s` has neighbours waiting behind, or a branch open, and marks its
 * cross-links. Any badges from before are taken away first; with no exploration, none is left.
 */
export function drawBadges(
  svg: SVGSVGElement | null,
  s: ExploreSession | null,
  edges: readonly FocusEdge[],
  acts: ExploreActs,
): void {
  if (!svg) return;
  for (const old of Array.from(svg.querySelectorAll('.thoughtknot-explore-badge'))) old.remove();
  for (const g of Array.from(svg.querySelectorAll('.thoughtknot-explore-cross')))
    g.classList.remove('thoughtknot-explore-cross');
  if (!s) return;
  const cross = s.cross(edges);
  for (const g of Array.from(svg.querySelectorAll('g.edge[data-link]')))
    if (cross.has(Number(g.getAttribute('data-link')))) g.classList.add('thoughtknot-explore-cross');
  for (const b of s.badges()) {
    const box = Array.from(svg.querySelectorAll('g.node[data-key]')).find((g) => g.getAttribute('data-key') === b.key);
    const at = box && rightEdge(box);
    if (!box || !at) continue;
    const opens = b.hidden > 0;
    const label = opens
      ? word('explore.open', { count: b.hidden, thing: acts.text(b.key) })
      : word('explore.close', { thing: acts.text(b.key) });
    const badge = svg.ownerDocument.createElementNS(SVG, 'g');
    badge.setAttribute('class', `thoughtknot-explore-badge ${opens ? 'is-more' : 'is-open'}`);
    badge.setAttribute('data-explore', b.key);
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', label);
    const circle = svg.ownerDocument.createElementNS(SVG, 'circle');
    circle.setAttribute('cx', String(at[0]));
    circle.setAttribute('cy', String(at[1]));
    circle.setAttribute('r', String(BADGE_R));
    const text = svg.ownerDocument.createElementNS(SVG, 'text');
    text.setAttribute('x', String(at[0]));
    text.setAttribute('y', String(at[1] + 4));
    text.setAttribute('text-anchor', 'middle');
    text.textContent = opens ? `+${b.hidden}` : '−';
    const title = svg.ownerDocument.createElementNS(SVG, 'title');
    title.textContent = label;
    badge.append(title, circle, text);
    const act = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      if (opens ? s.open(b.key) : s.close(b.key)) acts.changed();
    };
    // the badge is its own target: a tap on it opens or closes, and never selects the box (explore_badges)
    for (const kind of ['pointerdown', 'pointerup', 'mousedown'])
      badge.addEventListener(kind, (e) => e.stopPropagation());
    badge.addEventListener('click', act);
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') act(e);
    });
    (box.parentElement ?? svg).appendChild(badge);
  }
}

/** The middle of the right-hand edge of box `g`, in its group's units, read from its outline's points. */
function rightEdge(g: Element): [number, number] | null {
  const shape = g.querySelector('path, polygon, ellipse, rect');
  if (!shape) return null;
  const n = (a: string) => Number(shape.getAttribute(a) ?? 0);
  if (shape.tagName.toLowerCase() === 'ellipse') return [n('cx') + n('rx'), n('cy')];
  if (shape.tagName.toLowerCase() === 'rect') return [n('x') + n('width'), n('y') + n('height') / 2];
  const nums = (shape.getAttribute('d') ?? shape.getAttribute('points') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length < 2) return null;
  const xs = nums.filter((_v, i) => i % 2 === 0),
    ys = nums.filter((_v, i) => i % 2 === 1);
  return [Math.max(...xs), (Math.min(...ys) + Math.max(...ys)) / 2];
}
