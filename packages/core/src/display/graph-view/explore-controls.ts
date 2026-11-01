// The controls of an exploration on the card (editor spec §71). Roger, 31 Oct 2026: the controls sit on screen, with
// no menu to open. The banner says what is explored, with the whole graph again; the sidebar holds the rest
// (explore-sidebar.ts). A shown thing with neighbours waiting has a + badge, its own target, which opens its branch.
// An open branch has a − that folds it. Cross-links are marked, and hidden unless Other links is on (Roger, 1 Nov
// 2026: a classic mind map).
import { word } from '@thoughtknot/core';
import type { FocusEdge } from '@thoughtknot/core';
import type { ExploreSession } from '../../explore-session.ts';
import type { BannerRow } from './untangle-banner';

/** What the controls ask of their card. */
export interface ExploreActs {
  /** Draws the exploration again, after a change. */
  changed: () => void;
  /** Leaves the exploration and shows the whole graph. */
  stop: () => void;
  /** A thing's name, by its key. */
  text: (key: string) => string;
  /** Saves the exploration in the style graph, where the card can (explore_saved). */
  save?: () => void;
}

/** The banner's line for `s`: what it shows, and the whole graph again. Its other controls are in the sidebar. */
export function exploreRow(s: ExploreSession, acts: ExploreActs): BannerRow {
  return {
    words: word('explore.showing', { thing: acts.text(s.centre), count: s.keys().length }),
    actions: [{ label: word('explore.stop'), run: acts.stop }],
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
  const boxes = new Map(
    Array.from(svg.querySelectorAll('g.node[data-key]')).map((g) => [g.getAttribute('data-key') ?? '', g]),
  );
  const middle = sidesOf(boxes.get(s.centre));
  for (const b of s.badges()) {
    const box = boxes.get(b.key),
      sides = box && sidesOf(box);
    if (!box || !sides) continue;
    // the toggle sits at the branch's outer end, as in a classic mind map: on the left for a branch to the left
    const left = !!middle && sides.left[0] + sides.right[0] < middle.left[0] + middle.right[0];
    const [x, y] = left ? sides.left : sides.right,
      step = (left ? -1 : 1) * (2 * BADGE_R + 4);
    const folds = b.open && b.key !== s.centre;
    // an open branch always folds with its −; neighbours still waiting show beside it as + more (explore_badges)
    if (folds)
      badgeOn(box, acts, {
        at: [x, y],
        kind: 'close',
        label: word('explore.close', { thing: acts.text(b.key) }),
        shown: '−',
        run: () => s.close(b.key),
      });
    if (b.hidden > 0) {
      const label = word('explore.open', { count: b.hidden, thing: acts.text(b.key) });
      badgeOn(box, acts, {
        at: [folds ? x + step : x, y],
        kind: 'more',
        label,
        shown: `+${b.hidden}`,
        run: () => s.open(b.key),
      });
    }
  }
}

/** One badge: where it sits, which kind, what it says and shows, and what a press runs. */
interface Badge {
  at: [number, number];
  kind: 'close' | 'more';
  label: string;
  shown: string;
  run: () => boolean;
}

/** Draws badge `b` beside `box`: its own target, which runs `b.run` and never selects the box. */
function badgeOn(box: Element, acts: ExploreActs, { at, kind, label, shown, run }: Badge): void {
  const doc = box.ownerDocument;
  const badge = doc.createElementNS(SVG, 'g');
  badge.setAttribute('class', `thoughtknot-explore-badge ${kind === 'more' ? 'is-more' : 'is-open'}`);
  badge.setAttribute('data-explore', box.getAttribute('data-key') ?? '');
  badge.setAttribute('data-fold', kind);
  badge.setAttribute('role', 'button');
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('aria-label', label);
  const circle = doc.createElementNS(SVG, 'circle');
  circle.setAttribute('cx', String(at[0]));
  circle.setAttribute('cy', String(at[1]));
  circle.setAttribute('r', String(BADGE_R));
  const text = doc.createElementNS(SVG, 'text');
  text.setAttribute('x', String(at[0]));
  text.setAttribute('y', String(at[1] + 4));
  text.setAttribute('text-anchor', 'middle');
  text.textContent = shown;
  const title = doc.createElementNS(SVG, 'title');
  title.textContent = label;
  badge.append(title, circle, text);
  const act = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    if (run()) acts.changed();
  };
  // the badge is its own target: a tap on it opens or closes, and never selects the box (explore_badges)
  for (const k of ['pointerdown', 'pointerup', 'mousedown']) badge.addEventListener(k, (e) => e.stopPropagation());
  badge.addEventListener('click', act);
  badge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') act(e);
  });
  (box.parentElement ?? box).appendChild(badge);
}

/**
 * The middles of the left and right edges of box `g`, in its group's units. A browser measures its outline; where
 * none can, the outline's points are read: Graphviz draws boxes with absolute points only.
 */
function sidesOf(g: Element | undefined): { left: [number, number]; right: [number, number] } | null {
  const shape = g?.querySelector('path, polygon, ellipse, rect');
  if (!shape) return null;
  const sides = (x0: number, x1: number, y: number) => ({
    left: [x0, y] as [number, number],
    right: [x1, y] as [number, number],
  });
  const box = 'getBBox' in shape ? measured(shape as SVGGraphicsElement) : null;
  if (box && box.width > 0) return sides(box.x, box.x + box.width, box.y + box.height / 2);
  const n = (a: string) => Number(shape.getAttribute(a) ?? 0);
  if (shape.tagName.toLowerCase() === 'ellipse') return sides(n('cx') - n('rx'), n('cx') + n('rx'), n('cy'));
  if (shape.tagName.toLowerCase() === 'rect') return sides(n('x'), n('x') + n('width'), n('y') + n('height') / 2);
  const nums = (shape.getAttribute('d') ?? shape.getAttribute('points') ?? '')
    .match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)
    ?.map(Number);
  if (!nums || nums.length < 2) return null;
  const xs = nums.filter((_v, i) => i % 2 === 0),
    ys = nums.filter((_v, i) => i % 2 === 1);
  return sides(Math.min(...xs), Math.max(...xs), (Math.min(...ys) + Math.max(...ys)) / 2);
}

/** `shape`'s measured box, or null where it cannot be measured, as before it is on the page. */
function measured(shape: SVGGraphicsElement): DOMRect | null {
  try {
    return shape.getBBox();
  } catch {
    return null;
  }
}
