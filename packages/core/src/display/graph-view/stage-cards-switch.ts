// Cards on and off for the new rendering's stage (ES§73, render_cards). Here are the dock's Cards button and the glide.
// The glide spreads the drawing to make room for the cards, or draws it back. The cards are in stage-cards.ts.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, NoteReading } from '../../note-reading.ts';
import { noteOf } from '../../links.ts';
import type { LinkHost } from '../link-host.ts';
import {
  CARD_ON_CHOICE,
  cardSizeOf,
  cardsInPlace,
  cardsLaid,
  type CardFit,
  type CardsLaid,
} from '../../render/render-cards.ts';
import type { View } from '../../render/render-marks.ts';
import { MORPH_MS, morphed } from '../../render/render-morph.ts';
import { roomSizes } from '../../render/render-detail.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { Scene } from '../../render/render-scene.ts';
import { word } from '../../words.ts';
import { button } from '../button.ts';
import { StageCards, cardTexts, cardsChosen, chooseCards, type CardWords } from './stage-cards.ts';
import { fitsOf, glide, placesOf, withFits } from './stage-cards-fit.ts';
import { MoveUndo } from './move-undo.ts';
import { groundShift } from '../../render/render-tilt.ts';

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
  /** Where the reader put cards by hand, in the layout's own places. */
  places?: ReadonlyMap<string, { x: number; y: number }>;
}

/**
 * The cards of `h` laid at `spots`, each sized as its reader chose. As a card is resized, the cards keep the spread
 * they have (`keep`) and that card stays put (`pinned`).
 */
function layCards(
  h: CardsHost,
  spots: ReadonlyMap<string, Spot>,
  keep?: number,
  pinned?: ReadonlySet<string>,
): CardsLaid {
  const texts = withFits(cardTexts(h.drawing, h.g, h.words), h.fits ?? new Map());
  return h.kind && CARD_ON_CHOICE.has(h.kind)
    ? cardsInPlace(h.scene, spots, texts) // where a place means something, nothing spreads
    : cardsLaid(h.scene, spots, texts, h.drawing.links, 1, keep, pinned);
}

/** `laid` with each card the reader put by hand at its place, pinned there; the cards round them make room. */
function withHands(h: CardsHost, laid: CardsLaid): CardsLaid {
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
 * The dock's Cards button in `root`, for `stage`, on graph `graph`: pressed, each item shows as a card with its whole
 * note. The choice is kept for the graph, so a card drawn again, as typing draws it, opens as it was left.
 */
export function cardsControl(
  root: HTMLElement,
  stage: {
    showCards: (on: boolean, atOnce?: boolean) => void;
    cardsOn: { words?: CardWords; button?: HTMLElement; graph: string };
  },
  graph: string,
  words?: CardWords,
): { unload: () => void } | null {
  const body = root.querySelector<HTMLElement>('.thoughtknot-view-dock .thoughtknot-dock-body');
  if (!body) return null;
  stage.cardsOn.words = words;
  stage.cardsOn.graph = graph;
  const b = button(body, word('view.cards'), 'square-stack', () => {
    const on = !cardsChosen(graph);
    chooseCards(graph, on);
    b.setAttribute('aria-pressed', String(on));
    stage.showCards(on);
  });
  stage.cardsOn.button = b; // the stage's unload takes it away
  b.setAttribute('title', word('view.cards'));
  b.setAttribute('aria-pressed', String(cardsChosen(graph)));
  if (cardsChosen(graph)) stage.showCards(true, true);
  return { unload: () => b.remove() };
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

/** A stage's cards while Cards is on, what the host gives them to show, and the glide between on and off. */
export class CardsSwitch {
  cards: StageCards | null = null;
  /** What the host gives the cards to show: its own Markdown rendering, and linked notes. */
  words?: CardWords;
  /** The dock's Cards button, which goes with the stage. */
  button?: HTMLElement;
  /** The graph the cards are of, whose cards keep the sizes their reader gave them. */
  graph = '';
  /** Brings a glide still under way to rest at once. */
  private stop = (): void => {};
  /** The stage the cards were last turned on for, which a card sized anew is laid again on. */
  private host: (CardsHost & { draw: () => void }) | null = null;

  /** Turns Cards on or off for stage `h`, as `switchCards` does, drawing each frame; gives the view to show now. */
  turn(h: Omit<CardsHost, 'words'> & { draw: () => void }, on: boolean, done: () => void, atOnce = false): View {
    if (on === !!this.cards) return h.view;
    this.stop(); // a press mid-glide starts from where that glide was going
    const fits = fitsOf(this.graph);
    const places = placesOf(this.graph);
    this.host = { ...h, words: this.words, fits, places, onFit: (k, f, tall) => this.fit(k, f, tall) };
    const next = switchCards(this.host, this.cards, on, h.draw, done, atOnce);
    [this.cards, this.stop] = [next.cards, next.stop];
    return next.view;
  }

  /**
   * Sizes card `key` as `fit`, all it holds `tall` pixels high where it was seen so. The card sized keeps its place,
   * and the cards it would cover glide aside; nothing else moves (Roger, 15 Nov 2026).
   */
  fit(key: string, fit: CardFit | undefined, tall?: number): void {
    const [h, cards] = [this.host, this.cards];
    if (!h || !cards) return;
    this.stop();
    const fits = fitsOf(this.graph);
    if (fit) fits.set(key, { fit, ...(tall ? { tall } : {}) });
    else fits.delete(key);
    // laid from where the cards are now: the card keeps its top edge, and only cards it now covers move aside
    const was = cards.laid,
      spots = new Map(was.spots),
      at = was.cards.find((c) => c.key === key),
      s = spots.get(key);
    if (at && s && !was.only) spots.set(key, { ...s, y: s.y + (cardSizeOf({ ...at.text, fit, tall }).h - at.h) / 2 });
    this.relay(key, spots);
  }

  /** The cards laid again from `spots`, at the spread they have: `key` and every card put by hand stay, others glide. */
  private relay(key: string, spots: Map<string, Spot>): void {
    const [h, cards] = [this.host, this.cards];
    if (!h || !cards) return;
    const was = cards.laid,
      pinned = new Set([key, ...placesOf(this.graph).keys()]);
    const laid = { ...layCards(h, spots, 1, pinned), spread: was.spread, cx: was.cx, cy: was.cy };
    cards.refit(laid);
    cards.settled = false; // the arrows wait for the cards to come to rest
    h.sizes.splice(0, h.sizes.length, ...roomSizes(h.scene, laid.spots));
    this.stop = glide(h.spots, laid.spots, h.draw, () => ((cards.settled = true), h.draw()));
  }

  /** The card held by its head, where it was, whether it has moved, and the view it is dragged under. */
  private held: { key: string; from: Spot; moved: boolean; view: () => View } | null = null;
  private undoes: MoveUndo | null = null;

  /** Takes the card whose head is at `x`, `y` on the screen under `view`; says whether it took one. */
  grab(x: number, y: number, view: () => View): boolean {
    const key = this.cards && !this.cards.laid.only ? this.cards.pickAt(x, y, true) : null,
      from = key ? this.host?.spots.get(key) : undefined;
    this.held = key && from ? { key, from: { ...from }, moved: false, view } : null;
    if (this.held) this.stop(); // a card taken mid-glide is taken where it is going
    return !!this.held;
  }

  /** Moves the card held by `dx`, `dy` screen pixels, over the ground however the camera looks. */
  drag(dx: number, dy: number): void {
    const [h, held] = [this.host, this.held],
      s = held && h?.spots.get(held.key);
    if (!h || !held || !s || !this.cards) return;
    const v = held.view(),
      [gx, gy] = groundShift(v, dx, dy);
    h.spots.set(held.key, { ...s, x: s.x + gx / v.scale, y: s.y + gy / v.scale });
    [held.moved, this.cards.settled] = [true, false]; // its arrows wait until it is let go
    h.draw();
  }

  /** Lets the card go: it stays where it was put, the cards it covers move aside, and its undo is offered. */
  drop(): void {
    const [h, held, cards] = [this.host, this.held, this.cards];
    this.held = null;
    const to = held?.moved ? h?.spots.get(held.key) : undefined;
    if (!h || !held || !cards || !to) return;
    const places = placesOf(this.graph),
      had = places.get(held.key);
    const { spread, cx, cy } = cards.laid;
    const at = (s: Spot) => ({ x: cx + (s.x - cx) / spread, y: cy + (s.y - cy) / spread });
    const put = (p: { x: number; y: number } | undefined, s: Spot): void => {
      if (p) places.set(held.key, p);
      else places.delete(held.key);
      this.stop();
      this.relay(held.key, new Map([...(this.cards?.laid.spots ?? []), [held.key, s]]));
    };
    put(at(to), to);
    const name = h.scene.nodes.get(held.key)?.name ?? held.key;
    this.undoes ??= new MoveUndo(h.viewport, this.graph);
    this.undoes.offer(
      word('layout.placed', { thing: name }),
      () => put(had, held.from),
      () => put(at(to), to),
    );
  }

  /** Stops a glide under way and takes the cards away, as the stage goes. */
  remove(): void {
    this.stop();
    this.cards?.remove();
    this.button?.remove();
  }
}
