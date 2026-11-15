// Each card sized by its reader (ES§73, render_cards). Roger, 15 Nov 2026: "expand card out or shrink them (based on
// content) on a per card basis". A card shows its name only, its first lines, or all it holds. The card the reader
// sized stays where it is, at its top edge, and the cards it would cover glide aside to make room. The size each card
// was given is kept for the graph while the plugin runs. It is view data, never written into the note (R16).
import { cardSizeOf, type CardBox, type CardFit, type CardText } from '../../render/render-cards.ts';
import { MORPH_MS, morphed } from '../../render/render-morph.ts';
import type { Spot } from '../../render/render-rooms.ts';
import { word } from '../../words.ts';
import { setIcon } from '../host.ts';

/** How each card was sized, by graph and then by thing; a card not named shows its first lines. */
const sized = new Map<string, Map<string, { fit: CardFit; tall?: number }>>();

/** How the cards of `graph` were sized. */
export function fitsOf(graph: string): Map<string, { fit: CardFit; tall?: number }> {
  let m = sized.get(graph);
  if (!m) sized.set(graph, (m = new Map<string, { fit: CardFit; tall?: number }>()));
  return m;
}

/** Where the reader put each card of each graph by hand, by thing, in the layout's own places (before spreading). */
const put = new Map<string, Map<string, { x: number; y: number }>>();

/** Where the reader put the cards of `graph` by hand. */
export function placesOf(graph: string): Map<string, { x: number; y: number }> {
  let m = put.get(graph);
  if (!m) put.set(graph, (m = new Map<string, { x: number; y: number }>()));
  return m;
}

/** The texts `texts`, each sized as `fits` says. */
export function withFits(
  texts: Map<string, CardText>,
  fits: ReadonlyMap<string, { fit: CardFit; tall?: number }>,
): Map<string, CardText> {
  for (const [k, f] of fits) {
    const t = texts.get(k);
    if (t) texts.set(k, { ...t, ...f });
  }
  return texts;
}

/** Whether Cards is on for each graph, by its name, while the plugin runs: a card drawn again keeps it. */
const turnedOn = new Map<string, boolean>();
/** Whether Cards is on for `graph`. */
export const cardsChosen = (graph: string): boolean => turnedOn.get(graph) ?? false;
/** Keeps whether Cards is on for `graph`. */
export const chooseCards = (graph: string, on: boolean): void => void turnedOn.set(graph, on);

/** The pin in a card's head `head`, shown while the card is put by hand: pressed, `unpin` gives it back to the layout. */
export function unpinButton(head: HTMLElement, unpin: () => void): void {
  const label = word('view.cards.unpin');
  const b = head.createEl('button', {
    cls: 'thoughtknot-stage-card-pin',
    attr: { type: 'button', tabindex: '-1', 'aria-label': label, title: label },
  });
  setIcon(b, 'pin');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    unpin();
  });
}

/** The card's own button in its head `head`, to show its name only or the whole card again; `press` is told. */
export function nameOnly(head: HTMLElement, press: () => void): void {
  const b = head.createEl('button', { cls: 'thoughtknot-stage-card-fit', attr: { type: 'button', tabindex: '-1' } });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    press();
  });
}

/** Card `el`'s height with all it holds, once `fill` has put its words in; none where nothing is drawn yet. */
export function tallOf(el: HTMLElement | undefined, fill: () => void): number | undefined {
  if (!el) return undefined;
  fill();
  el.addClass('is-full');
  return el.scrollHeight || undefined;
}

/** Card `el` marked as `card` is sized: its name only, its first lines or all of it, and its buttons say so. */
export function markFit(
  el: HTMLElement,
  card: CardBox & { more: number; text: CardText },
  body: HTMLElement | undefined,
  own: boolean,
): void {
  const fit = card.text.fit;
  el.setCssProps({ '--thoughtknot-card-w': `${card.w}px`, '--thoughtknot-card-h': `${card.h}px` });
  el.toggleClass('is-title', fit === 'title');
  el.toggleClass('is-full', fit === 'full');
  body?.toggleClass('is-cut', !!card.more);
  const more = el.querySelector<HTMLElement>('button.thoughtknot-stage-card-more');
  if (more && own) {
    more.setAttribute('aria-expanded', String(fit === 'full'));
    const left = cardSizeOf({ ...card.text, fit: undefined }).more;
    more.setText(fit === 'full' ? word('view.cards.less') : word('view.cards.more', { count: left }));
  }
  const b = el.querySelector<HTMLElement>('button.thoughtknot-stage-card-fit');
  if (!b) return;
  const label = word(fit === 'title' ? 'view.cards.whole' : 'view.cards.title');
  b.setAttribute('aria-label', label);
  b.setAttribute('title', label);
  b.setAttribute('aria-expanded', String(fit !== 'title'));
  setIcon(b, fit === 'title' ? 'chevron-down' : 'chevron-up');
}

/**
 * Glides the places `spots` to `to`, drawing each frame with `draw`, and tells `done` once they are at rest. Gives
 * what brings the glide to rest at once. With no frames to draw by, they go there at once.
 */
export function glide(
  spots: Map<string, Spot>,
  to: ReadonlyMap<string, Spot>,
  draw: () => void,
  done: () => void,
): () => void {
  const from = new Map([...spots].map(([k, s]) => [k, { x: s.x, y: s.y }]));
  let over = false;
  const stop = (): void => {
    if (over) return;
    over = true;
    for (const [k, s] of to) spots.set(k, s);
  };
  const frame = typeof requestAnimationFrame === 'undefined' ? null : requestAnimationFrame;
  if (!frame) return (stop(), done(), stop);
  const start = performance.now();
  const step = (now: number): void => {
    if (over) return;
    const t = (now - start) / MORPH_MS;
    if (t >= 1) return (stop(), done());
    for (const [k, s] of morphed(from, to, t)) spots.set(k, s);
    draw();
    frame(step);
  };
  frame(step);
  return stop;
}
