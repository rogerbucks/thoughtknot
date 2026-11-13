// Cards on and off for the new rendering's stage (ES§73, render_cards). Here are the dock's Cards button and the glide.
// The glide spreads the drawing to make room for the cards, or draws it back. The cards are in stage-cards.ts.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, NoteReading } from '../../note-reading.ts';
import { noteOf } from '../../links.ts';
import type { LinkHost } from '../link-host.ts';
import { CARD_ON_CHOICE, cardsInPlace, cardsLaid } from '../../render/render-cards.ts';
import type { View } from '../../render/render-marks.ts';
import { MORPH_MS, morphed } from '../../render/render-morph.ts';
import { roomSizes } from '../../render/render-detail.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { Scene } from '../../render/render-scene.ts';
import { word } from '../../words.ts';
import { button } from '../button.ts';
import { StageCards, cardTexts, cardsChosen, chooseCards, type CardWords } from './stage-cards.ts';

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
  const texts = on ? cardTexts(h.drawing, h.g, h.words) : null;
  // where a place means something, nothing spreads: only the chosen thing's card opens, where it is
  const inPlace = !!h.kind && CARD_ON_CHOICE.has(h.kind);
  const laid = texts
    ? inPlace
      ? cardsInPlace(h.scene, h.spots, texts)
      : cardsLaid(h.scene, h.spots, texts, h.drawing.links)
    : was?.laid;
  if (!laid || (on ? false : !was)) return { cards: was, view: h.view, stop: () => {} };
  const base = on ? new Map(h.spots) : (was as StageCards).base;
  const to = on ? laid.spots : base;
  const f = on ? laid.spread : 1 / laid.spread;
  const from = spreadBy(h.spots, f, laid.cx, laid.cy);
  const v = h.view;
  const view = { ...v, x: laid.cx + (v.x - laid.cx) * f, y: laid.cy + (v.y - laid.cy) * f, scale: v.scale / f };
  h.sizes.splice(0, h.sizes.length, ...roomSizes(h.scene, to as Map<string, Spot>));
  was?.remove();
  const cards = on ? new StageCards(h.viewport, laid, h.spots, base, h.scene.roots, h.words) : null;
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
  stage: { showCards: (on: boolean, atOnce?: boolean) => void; cardsOn: { words?: CardWords; button?: HTMLElement } },
  graph: string,
  words?: CardWords,
): { unload: () => void } | null {
  const body = root.querySelector<HTMLElement>('.thoughtknot-view-dock .thoughtknot-dock-body');
  if (!body) return null;
  stage.cardsOn.words = words;
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
  /** Brings a glide still under way to rest at once. */
  private stop = (): void => {};

  /** Turns Cards on or off for stage `h`, as `switchCards` does, drawing each frame; gives the view to show now. */
  turn(h: Omit<CardsHost, 'words'> & { draw: () => void }, on: boolean, done: () => void, atOnce = false): View {
    if (on === !!this.cards) return h.view;
    this.stop(); // a press mid-glide starts from where that glide was going
    const next = switchCards({ ...h, words: this.words }, this.cards, on, h.draw, done, atOnce);
    [this.cards, this.stop] = [next.cards, next.stop];
    return next.view;
  }

  /** Stops a glide under way and takes the cards away, as the stage goes. */
  remove(): void {
    this.stop();
    this.cards?.remove();
    this.button?.remove();
  }
}
