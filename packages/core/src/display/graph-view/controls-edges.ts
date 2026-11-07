// The cards down each side of the drawing stack, never overlap (editor spec §25, panels_stack). Roger, 6 Nov 2026:
// "The side panels regularly overlap each other … and the text on screen." Each side of the
// drawing is a column. At its top sits the corner card: the controls card at the start, the panels docked at the end.
// At its foot sit the mini-map and the 3D view's pad. A thing's details float between them, on the end side. Each card
// is measured here, and the room each side has left is said to the style sheet in CSS variables on the view:
// - --thoughtknot-{side}-top: how far down the drawing the corner card on that side ends, with a gap below it;
// - --thoughtknot-{side}-foot: how far up the drawing the cards at its foot reach, with a gap above them;
// - --thoughtknot-{side}-fixed: the part of that foot that never grows: the mini-map, and the head of a folded pad;
// - --thoughtknot-drawing-top, --thoughtknot-drawing-foot and --thoughtknot-drawing-height: where the drawing sits in
//   the view, for a card the view places.
// The style sheet then caps each card to the room left to it, and it scrolls inside. The corner card is capped by the
// fixed foot alone, and the pad and the details by what is measured above and below them. So nothing waits on itself.
import type { ScreenBox } from './controls-cover.ts';

/** The two sides of the drawing, as the page reads: the start is the left in a left-to-right page. */
export type Side = 'start' | 'end';

/** A card down a side, and whether it holds the top or the foot of that side. */
export interface EdgeCard {
  side: Side;
  at: 'top' | 'foot';
  box: ScreenBox;
  /** How much of its height never grows, as a mini-map's; all of it when unsaid. */
  fixed?: number;
}

/** The gap between two cards, and between a card and the drawing's edge, in CSS pixels (--gn-space-2). */
export const EDGE_GAP = 8;

/** The room each side of `drawing` has left, in CSS pixels from its top and its foot, with the `cards` down it. */
export function edgesOf(
  drawing: ScreenBox,
  cards: readonly EdgeCard[],
  gap = EDGE_GAP,
): Record<Side, { top: number; foot: number; fixed: number }> {
  const room = { start: { top: 0, foot: 0, fixed: 0 }, end: { top: 0, foot: 0, fixed: 0 } };
  for (const { side, at, box, fixed } of cards) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    const r = room[side];
    if (at === 'top') r.top = Math.max(r.top, box.bottom - drawing.top + gap);
    else {
      r.foot = Math.max(r.foot, drawing.bottom - box.top + gap);
      r.fixed = Math.max(r.fixed, drawing.bottom - box.bottom + (fixed ?? box.bottom - box.top) + gap);
    }
  }
  return room;
}

/** The height of a folded pad's head, which the corner card above it always leaves free: one row of buttons. */
const PAD_HEAD = 56;

const shown = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !el.closest('[hidden], .thoughtknot-phone-sheet');
};

/** The cards down the sides of the drawing in `view`, and which side and end each holds. */
export function edgeCardsIn(view: HTMLElement): EdgeCard[] {
  const cards: EdgeCard[] = [];
  const box = (el: Element): ScreenBox => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  for (const el of Array.from(view.querySelectorAll('.thoughtknot-over > .thoughtknot-corner')))
    if (shown(el))
      cards.push({ side: el.classList.contains('thoughtknot-corner-end') ? 'end' : 'start', at: 'top', box: box(el) });
  // the flat mini-map holds the bottom end corner; in 2.5D and 3D it holds the bottom start, the pad the bottom end
  for (const el of Array.from(view.querySelectorAll('.thoughtknot-mini-map')))
    if (shown(el)) cards.push({ side: el.classList.contains('is-space') ? 'start' : 'end', at: 'foot', box: box(el) });
  for (const el of Array.from(view.querySelectorAll('.thoughtknot-space-pad')))
    if (shown(el)) cards.push({ side: 'end', at: 'foot', box: box(el), fixed: PAD_HEAD });
  return cards;
}

/**
 * Says to the style sheet, on `view`, the room each side of its `drawing` has left (see the top of this file). The
 * corner card and the pad are placed by the style sheet, so it is measured again whenever one of them changes size.
 */
export function keepEdges(view: HTMLElement, drawing: HTMLElement): void {
  const d = drawing.getBoundingClientRect(),
    v = view.getBoundingClientRect();
  if (d.height <= 0) return;
  const room = edgesOf({ left: d.left, top: d.top, right: d.right, bottom: d.bottom }, edgeCardsIn(view));
  const px = (n: number) => `${Math.round(n)}px`;
  const props: Record<string, string> = {
    '--thoughtknot-drawing-top': px(d.top - v.top - view.clientTop),
    '--thoughtknot-drawing-foot': px(v.top + view.clientTop + view.clientHeight - d.bottom),
    '--thoughtknot-drawing-height': px(d.height),
  };
  for (const side of ['start', 'end'] as const) {
    props[`--thoughtknot-${side}-top`] = px(room[side].top);
    props[`--thoughtknot-${side}-foot`] = px(room[side].foot);
    props[`--thoughtknot-${side}-fixed`] = px(room[side].fixed);
  }
  // only what changed, so writing them never starts another round of measuring
  for (const [name, value] of Object.entries(props))
    if (view.style.getPropertyValue(name) !== value) view.style.setProperty(name, value);
}

/**
 * Keeps the room of each side said on `view` as its cards come, go, fold and open, and as `drawing` changes size. Gives
 * back how to stop.
 */
export function watchEdges(view: HTMLElement, drawing: HTMLElement): () => void {
  const win = view.ownerDocument.defaultView;
  const resizeObserver = (win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  const mutationObserver = (win as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
  if (!win || typeof resizeObserver !== 'function' || typeof mutationObserver !== 'function') return () => undefined;
  let queued = false;
  const sizes = new resizeObserver(() => soon());
  const watched = new Set<Element>();
  const soon = () => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      keepEdges(view, drawing);
      // a card that came since is watched too
      for (const el of Array.from(
        view.querySelectorAll('.thoughtknot-corner, .thoughtknot-mini-map, .thoughtknot-space-pad'),
      ))
        if (!watched.has(el)) (watched.add(el), sizes.observe(el));
    });
  };
  sizes.observe(drawing);
  // cards come and go, and show and hide, without changing the size of anything already watched
  const comings = new mutationObserver(soon);
  comings.observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  soon();
  return () => {
    sizes.disconnect();
    comings.disconnect();
  };
}
