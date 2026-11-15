// Laying the cards for the new rendering's stage, and the glide as Cards turns on or off (ES§73, render_cards). The
// cards are laid from the layout's places, each sized as its reader chose, round the cards put by hand.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, NoteReading } from '../../note-reading.ts';
import { noteOf } from '../../links.ts';
import type { LinkHost } from '../link-host.ts';
import { CARD_ON_CHOICE, cardsInPlace, cardsLaid, type CardFit, type CardsLaid } from '../../render/render-cards.ts';
import type { View } from '../../render/render-marks.ts';
import { MORPH_MS, morphed } from '../../render/render-morph.ts';
import { roomSizes } from '../../render/render-detail.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { Scene } from '../../render/render-scene.ts';
import { StageCards, cardTexts, type CardWords } from './stage-cards.ts';
import { withFits } from './stage-cards-fit.ts';
import type { PlacesHost } from './stage-places.ts';

/** What switching Cards needs of the stage: its card, scene, places and room sizes (both changed in place), and view. */
export interface CardsHost {
  viewport: HTMLElement;
  scene: Scene;
  spots: Map<string, Spot>;
  sizes: number[];
  drawing: GraphDrawing;
  g?: Graph;
  view: View;
  /** What the host gives the cards to show; none, plain text. */
  words?: CardWords;
  /** What the drawing is drawn as: a type whose places mean something opens only the chosen card. */
  kind?: string;
  /** How each card was sized by its reader; and told when the reader sizes one. */
  fits?: ReadonlyMap<string, { fit: CardFit; tall?: number }>;
  onFit?: (key: string, fit: CardFit | undefined, tall?: number) => void;
  /** How wide the reader made cards, by dragging their edges. */
  widths?: ReadonlyMap<string, number>;
  /** Where the reader put cards by hand, in the layout's own places. */
  places?: ReadonlyMap<string, { x: number; y: number }>;
  /** Where the cards' sizes and places are saved: the note's layout block (render_cards, layout_block). */
  saves?: PlacesHost;
}

/**
 * The cards of `h` laid at `spots`, each sized as its reader chose. As a card is resized, the cards keep the spread
 * they have (`keep`) and that card stays put (`pinned`).
 */
export function layCards(
  h: CardsHost,
  spots: ReadonlyMap<string, Spot>,
  keep?: number,
  pinned?: ReadonlySet<string>,
): CardsLaid {
  const texts = withFits(cardTexts(h.drawing, h.g, h.words), h.fits ?? new Map(), h.widths);
  return h.kind && CARD_ON_CHOICE.has(h.kind)
    ? cardsInPlace(h.scene, spots, texts) // where a place means something, nothing spreads
    : cardsLaid(h.scene, spots, texts, h.drawing.links, 1, keep, pinned);
}

/** `laid` with each card the reader put by hand at its place, pinned there; the cards round them make room. */
export function withHands(h: CardsHost, laid: CardsLaid): CardsLaid {
  if (laid.only || !h.places?.size) return laid;
  const spots = new Map(laid.spots);
  for (const [k, p] of h.places) {
    const s = spots.get(k);
    if (s)
      spots.set(k, { ...s, x: laid.cx + (p.x - laid.cx) * laid.spread, y: laid.cy + (p.y - laid.cy) * laid.spread });
  }
  return { ...layCards(h, spots, 1, new Set(h.places.keys())), spread: laid.spread, cx: laid.cx, cy: laid.cy };
}

/** `spots` spread by `f` from (`cx`, `cy`), each in place: what was drawn under a view, spread so. */
function spreadBy(spots: Map<string, Spot>, f: number, cx: number, cy: number): Map<string, { x: number; y: number }> {
  for (const [k, s] of spots) spots.set(k, { x: cx + (s.x - cx) * f, y: cy + (s.y - cy) * f, r: s.r * f });
  return new Map([...spots].map(([k, s]) => [k, { x: s.x, y: s.y }]));
}

/**
 * Turns Cards on or off for the stage `h`, whose cards are `was`. Every place, and the view, are first spread (or drawn
 * back) together, so the screen shows just what it did. Then each place glides the rest of the way, drawing each
 * frame, and `done` is told once all are at rest. `atOnce`, as when a card is drawn again, there is no glide.
 */
export function switchCards(
  h: CardsHost,
  was: StageCards | null,
  on: boolean,
  draw: () => void,
  done: () => void,
  atOnce = false,
): { cards: StageCards | null; view: View; stop: () => void } {
  const laid = on ? withHands(h, layCards(h, h.spots)) : was?.laid;
  if (!laid || (on ? false : !was)) return { cards: was, view: h.view, stop: () => {} };
  const base = on ? new Map(h.spots) : (was as StageCards).base;
  const to = on ? laid.spots : base;
  const f = on ? laid.spread : 1 / laid.spread;
  const from = spreadBy(h.spots, f, laid.cx, laid.cy);
  const v = h.view;
  const view = { ...v, x: laid.cx + (v.x - laid.cx) * f, y: laid.cy + (v.y - laid.cy) * f, scale: v.scale / f };
  h.sizes.splice(0, h.sizes.length, ...roomSizes(h.scene, to as Map<string, Spot>));
  was?.remove();
  const cards = on ? new StageCards(h.viewport, laid, h.spots, base, h.scene.roots, h.words, h.onFit) : null;
  const frame = typeof requestAnimationFrame === 'undefined' || atOnce ? null : requestAnimationFrame;
  let over = false;
  // stopped, the places go straight to where they glide: a switch after, or an unload, starts from rest
  const stop = (): void => {
    if (over) return;
    over = true;
    for (const [k, s] of to) h.spots.set(k, s);
    if (cards) cards.settled = true;
  };
  const end = (): void => void (!over && (stop(), done()));
  if (!frame) return (end(), { cards, view, stop });
  const start = performance.now();
  const step = (now: number): void => {
    if (over) return;
    const t = (now - start) / MORPH_MS;
    if (t >= 1) return end();
    for (const [k, s] of morphed(from, to, t)) h.spots.set(k, s);
    draw();
    frame(step);
  };
  frame(step);
  return { cards, view, stop };
}

/**
 * What a card's options give its cards. The host renders their Markdown, made safe. Each thing that is a note embeds
 * that note (node_is_a_note). Without a host that renders, the cards show plain text.
 */
export function cardWordsOf(o: { links?: LinkHost; reading: NoteReading; graph: string }): CardWords {
  const host = o.links;
  if (!host) return {};
  return {
    render: (markdown, el, owner) => host.render(markdown, el, owner),
    linked: (key) => {
      const note = noteOf(o.reading, o.graph, key);
      return note ? `![[${note.opens}]]` : undefined;
    },
  };
}
