// Every card over the drawing has its own slot, so no two ever overlap (editor spec §25, panels_never_overlap). Roger,
// 4 Nov 2026: panels overlapped, so fix it for every future change. The controls card holds the top start corner, a
// dock moved there the top end. The mini-map holds the bottom end corner. A card sharing a slot says in SHARING how it
// keeps clear. The level badge takes the top middle, between whatever holds the corners, or drops below them. A new
// card claims a slot in SLOTS, or says in ON_DEMAND why it may lie over the others. A test fails any card with neither.
import type { ScreenBox } from './controls-cover.ts';

/** Where a card over the drawing sits. `free` is a dock the person moved; `sheet` is the phone's control sheet. */
export type Slot =
  'top-start' | 'top-end' | 'top-middle' | 'bottom-end' | 'bottom-middle' | 'end-side' | 'free' | 'sheet';

/** Each card that floats over the drawing, by its class, and its slot. */
export const SLOTS: Readonly<Record<string, Slot>> = {
  'thoughtknot-corner': 'top-start',
  'thoughtknot-corner-end': 'top-end',
  'thoughtknot-zen-exit': 'top-end',
  'thoughtknot-mini-map': 'bottom-end',
  'thoughtknot-space-pad': 'bottom-end',
  'thoughtknot-level-badge': 'top-middle',
  'thoughtknot-undo-toast': 'bottom-middle',
  'thoughtknot-details': 'end-side',
  'thoughtknot-dock': 'free',
  'thoughtknot-phone-sheet': 'sheet',
};

/** What floats over the drawing only for a moment, or at a thing or a button, so it may lie over a card, and why. */
export const ON_DEMAND: Readonly<Record<string, string>> = {
  'thoughtknot-over-panels': 'a panel the bar opens, closed by Escape',
  'thoughtknot-cloud-card': 'a cloud’s card, opened from the cloud, closed by Escape',
  'thoughtknot-bar-more-list': 'the bar’s More list, under its button',
  'thoughtknot-thing-menu': 'a thing’s menu, at the pointer',
  'thoughtknot-quick-info': 'a thing’s quick look, at the pointer',
  'thoughtknot-suggestions': 'suggestions under the words being typed',
  'thoughtknot-massive-list': 'search results under the search box',
  'thoughtknot-edit-card': 'the editor of one thing, at that thing',
  'thoughtknot-edit-line': 'the editor of one link, at that link',
  'thoughtknot-move-hint': 'a hint for a moment after a move',
  'thoughtknot-pointer': 'the pointer of another person, on the drawing',
  'thoughtknot-sr': 'words for screen readers, never shown',
  'thoughtknot-type-list': 'a mark on a button, inside its list',
  'thoughtknot-view-list': 'a mark on a button, inside its list',
  'thoughtknot-sheet-resizer': 'the grip on the edge of the details',
};

/** Cards that share a slot with one before them in SLOTS, and how they keep clear of it. */
export const SHARING: Readonly<Record<string, string>> = {
  'thoughtknot-zen-exit': 'shows only in Zen, when the cards in the corners are hidden',
  'thoughtknot-space-pad': 'rides above the 3D mini-map, by its height (--thoughtknot-space-mini)',
};

/** The slots that hold a corner or a side. */
const HOLDING: readonly Slot[] = ['top-start', 'top-end', 'bottom-end', 'end-side'];

/** The cards that hold a slot of their own, which a card in the middle must keep clear of. */
const HELD = Object.keys(SLOTS).filter((c) => HOLDING.includes(SLOTS[c] as Slot));

/** The narrowest gap between two cards at the top that the badge goes into, its words wrapped, in CSS pixels (8rem). */
const MIDDLE_MIN = 128;

/** Where a card in the top middle goes: its insets from the view's start and end, and how far down it sits. */
export interface MiddlePlace {
  start: number;
  end: number;
  top: number;
}

const overlaps = (a: ScreenBox, b: ScreenBox): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where a card of `want` size goes in the top middle of `view`, clear of every card in `held`. It sits as high as it
 * can, `gap` from the top, in the widest clear span across the view at that height. Where no span is wide enough, it
 * drops below the card that blocks it, and tries again.
 */
export function middlePlace(
  view: ScreenBox,
  held: readonly ScreenBox[],
  want: { width: number; height: number },
  gap: number,
): MiddlePlace {
  const width = view.right - view.left;
  const cards = held.filter((c) => c.right - c.left > 0 && c.bottom - c.top > 0);
  let top = view.top + gap;
  // the widest clear span across the top, where it goes, its words wrapped, when no clear place is wide enough
  let first: { left: number; right: number } | null = null;
  for (let tries = 0; tries <= cards.length; tries++) {
    const band = { left: view.left, right: view.right, top, bottom: top + want.height };
    const across = cards.filter((c) => overlaps(c, band)).sort((a, b) => a.left - b.left);
    // the clear spans across the band, between the cards in it
    let from = view.left + gap,
      best = { left: from, right: from };
    for (const c of [
      ...across.map(({ left, right }) => ({ left, right })),
      { left: view.right - gap, right: view.right },
    ]) {
      if (c.left - from > best.right - best.left) best = { left: from, right: c.left };
      from = Math.max(from, c.right + gap);
    }
    first ??= best;
    if (best.right - best.left >= Math.min(want.width, width - 2 * gap) || !across.length)
      return { start: best.left - view.left, end: view.right - best.right, top: top - view.top };
    // too narrow: below the card that ends highest, and again, while it still fits in the view
    top = Math.min(...across.map((c) => c.bottom)) + gap;
    if (top + want.height > view.bottom - gap) break;
  }
  // a drawing too short to drop it below them. It goes between the cards at the top, its words wrapped, while that gap
  // is wide enough to read. Else it goes across the top, as it was.
  if (first && first.right - first.left >= MIDDLE_MIN)
    return { start: first.left - view.left, end: view.right - first.right, top: gap };
  return { start: 0, end: 0, top: gap };
}

const shownIn = (root: ParentNode | null | undefined, cls: string): HTMLElement[] =>
  Array.from(root?.querySelectorAll<HTMLElement>(`.${cls}`) ?? []).filter(
    (el) => !el.hidden && !el.closest('[hidden]') && !el.classList.contains('is-hidden'),
  );

/** The cards round `viewport` that hold a corner or a side: what the middle keeps clear of. */
export const slotCards = (viewport: HTMLElement): HTMLElement[] =>
  HELD.flatMap((c) => shownIn(viewport.parentElement, c));

/**
 * Keeps the level badge over `viewport` in the top middle, clear of the cards that hold the corners and sides. Its
 * insets and top are CSS variables, so the style sheet still places everything else.
 */
export function keepSlots(viewport: HTMLElement, gap = 8): void {
  if (typeof viewport.getBoundingClientRect === 'function') keepMiddleClear(viewport, gap);
}

/** Keeps the level badge in `viewport` clear of the cards that hold the corners. */
function keepMiddleClear(viewport: HTMLElement, gap: number): void {
  // a child of the viewport, found without a child selector, which the test DOM cannot match
  const badge = Array.from(viewport.children).find((c) => c.classList.contains('thoughtknot-level-badge')) as
    HTMLElement | undefined;
  if (!badge?.style || badge.hidden || badge.classList.contains('is-hidden')) return;
  // measured at its natural width: as wide as its words, before any insets narrow it
  for (const name of ['start', 'end', 'top']) badge.style.removeProperty(`--thoughtknot-slot-${name}`);
  const v = viewport.getBoundingClientRect(),
    b = badge.getBoundingClientRect();
  const at = middlePlace(
    { left: v.left, top: v.top, right: v.right, bottom: v.bottom },
    slotCards(viewport).map((el) => el.getBoundingClientRect()),
    { width: b.width, height: b.height },
    gap,
  );
  // measured from the left; in a right-to-left page the start is the right
  const rtl = viewport.ownerDocument.defaultView?.getComputedStyle(viewport).direction === 'rtl';
  badge.style.setProperty('--thoughtknot-slot-start', `${Math.round(rtl ? at.end : at.start)}px`);
  badge.style.setProperty('--thoughtknot-slot-end', `${Math.round(rtl ? at.start : at.end)}px`);
  badge.style.setProperty('--thoughtknot-slot-top', `${Math.round(at.top + viewport.scrollTop)}px`);
}
