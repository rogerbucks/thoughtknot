// Cards on and off for the new rendering's stage (ES§73, render_cards): the dock's Cards button, and the cards' sizes,
// places, pins and choice. stage-cards-lay.ts lays them and glides them on and off; stage-cards.ts draws them.
import type { NoteReading } from '../../note-reading.ts';
import { noteOf } from '../../links.ts';
import type { LinkHost } from '../link-host.ts';
import { cardSizeOf, type CardFit } from '../../render/render-cards.ts';
import type { View } from '../../render/render-marks.ts';
import { roomSizes } from '../../render/render-detail.ts';
import type { Spot } from '../../render/render-rooms.ts';
import { word } from '../../words.ts';
import { button } from '../button.ts';
import { StageCards, type CardWords } from './stage-cards.ts';
import { cardsChosen, chooseCards, fitsOf, glide, placesOf } from './stage-cards-fit.ts';
import { MoveUndo } from './move-undo.ts';
import { groundShift } from '../../render/render-tilt.ts';
import { CardChoice, fitOfStep, sharedStep, type CardStep } from '../../card-choice.ts';
import { choiceBar } from './stage-cards-choice.ts';
import { layCards, switchCards, withHands, type CardsHost } from './stage-cards-lay.ts';

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
    this.choose([]); // cards drawn anew start with none chosen
    const [fits, places] = [fitsOf(this.graph), placesOf(this.graph)];
    // as saved in the note, when it is: the layout block is the truth, and the card drawn again reads it anew
    if (h.saves?.cards) {
      fits.clear();
      places.clear();
    }
    for (const [k, c] of h.saves?.cards ?? []) {
      if (c.fit) fits.set(k, { fit: c.fit, ...(c.h && { tall: c.h }) });
      if (c.placed) places.set(k, { x: c.x, y: c.y });
    }
    this.host = { ...h, words: this.words, fits, places, onFit: (k, f, tall) => this.fit(k, f, tall) };
    const next = switchCards(this.host, this.cards, on, h.draw, done, atOnce);
    [this.cards, this.stop] = [next.cards, next.stop];
    if (this.cards) this.cards.onUnpin = (k) => this.unpin([k]);
    this.markPins();
    return next.view;
  }

  /**
   * Sizes card `key` as `fit`, all it holds `tall` pixels high where it was seen so. The card sized keeps its place,
   * and the cards it would cover glide aside; nothing else moves (Roger, 15 Nov 2026).
   */
  fit(key: string, fit: CardFit | undefined, tall?: number): void {
    this.fitAll(new Map([[key, tall]]), fit);
  }

  /** Sizes each card of `talls` as `fit`, as `fit` sizes one: each keeps its place, and the cards round them move. */
  private fitAll(talls: ReadonlyMap<string, number | undefined>, fit: CardFit | undefined): void {
    const [h, cards] = [this.host, this.cards];
    if (!h || !cards) return;
    this.stop();
    const fits = fitsOf(this.graph),
      was = cards.laid,
      spots = new Map(was.spots);
    for (const [key, tall] of talls) {
      if (fit) fits.set(key, { fit, ...(tall ? { tall } : {}) });
      else fits.delete(key);
      this.save(key);
      // laid from where the cards are now: the card keeps its top edge, and only cards it now covers move aside
      const at = was.cards.find((c) => c.key === key),
        s = spots.get(key);
      if (at && s && !was.only) spots.set(key, { ...s, y: s.y + (cardSizeOf({ ...at.text, fit, tall }).h - at.h) / 2 });
    }
    this.relay([...talls.keys()], spots);
  }

  /** The cards chosen together, which the chosen bar sizes at once, and the bar while any is chosen. */
  readonly chosen = new CardChoice();
  private bar: HTMLElement | null = null;

  /**
   * A click `e` on the stage's canvas, whose box is `r`. With Shift, Cmd or Ctrl held it chooses the card under it,
   * or lets it go, and says it took the click. Any other click lets the chosen cards go, and the stage takes it.
   */
  chose(e: MouseEvent, r: DOMRect): boolean {
    const together = e.shiftKey || e.metaKey || e.ctrlKey,
      key = together ? this.cards?.pickAt(e.clientX - r.left, e.clientY - r.top) : null;
    if (!key) return (together || this.choose([]), false);
    this.chosen.toggle(key);
    return (this.choose(this.chosen.list()), true);
  }

  /** Chooses just the cards `keys`, marks them, and shows the bar over them (none when none is chosen). */
  private choose(keys: readonly string[]): void {
    if (!keys.length && !this.chosen.size && !this.bar) return;
    this.chosen.set(keys);
    this.cards?.mark('is-chosen', this.chosen.all());
    const viewport = this.host?.viewport;
    const step = sharedStep(fitsOf(this.graph), this.chosen.list());
    this.bar?.remove();
    this.bar = viewport
      ? choiceBar(viewport, this.chosen.size, step, {
          size: (s) => this.sizeChosen(s),
          every: () => this.choose(this.cards?.laid.cards.map((c) => c.key) ?? []),
          pin: () => this.pin(this.chosen.list()),
          unpin: () => this.unpin(this.chosen.list()),
          clear: () => this.choose([]),
        })
      : null;
  }

  /** Gives every chosen card the step `step`, at once; each with all it holds is measured as it then stands. */
  sizeChosen(step: CardStep): void {
    const [cards, fit] = [this.cards, fitOfStep(step)];
    if (!cards || !this.chosen.size) return;
    this.fitAll(new Map(this.chosen.list().map((k) => [k, fit === 'full' ? cards.tall(k) : undefined])), fit);
    this.choose(this.chosen.list()); // the bar says the step they share now
  }

  /** The cards laid again from `spots`, at the spread they have: `keys` and every card put by hand stay, others glide. */
  private relay(keys: readonly string[], spots: Map<string, Spot>): void {
    const [h, cards] = [this.host, this.cards];
    if (!h || !cards) return;
    const was = cards.laid,
      pinned = new Set([...keys, ...placesOf(this.graph).keys()]);
    const laid = { ...layCards(h, spots, 1, pinned), spread: was.spread, cx: was.cx, cy: was.cy };
    cards.refit(laid);
    this.markPins();
    cards.settled = false; // the arrows wait for the cards to come to rest
    h.sizes.splice(0, h.sizes.length, ...roomSizes(h.scene, laid.spots));
    this.stop = glide(h.spots, laid.spots, h.draw, () => ((cards.settled = true), h.draw()));
  }

  /**
   * Saves card `key` as its reader sized and put it, in the layout's own places; one sized and put as laid is forgotten.
   * Where nothing is saved, as with a block another plugin draws, it is kept while the plugin runs.
   */
  private save(key: string): void {
    const [h, cards] = [this.host, this.cards];
    const [f, p] = [fitsOf(this.graph).get(key), placesOf(this.graph).get(key)];
    const at = cards?.laid.cards.find((c) => c.key === key);
    if (!h?.saves?.card || !cards || !at) return;
    const { spread, cx, cy } = cards.laid;
    const here = p ?? { x: cx + (at.x - cx) / spread, y: cy + (at.y - cy) / spread };
    const c =
      f || p ? { ...here, ...(p && { placed: true }), ...(f && { fit: f.fit }), ...(f?.tall && { h: f.tall }) } : null;
    void h.saves.card(key, c);
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
    const had = placesOf(this.graph).get(held.key);
    const at = this.baseOf(to);
    const put = (p: { x: number; y: number } | undefined, s: Spot) => this.put(new Map([[held.key, { p, s }]]));
    put(at, to);
    const name = h.scene.nodes.get(held.key)?.name ?? held.key;
    this.offer(
      word('layout.placed', { thing: name }),
      () => put(had, held.from),
      () => put(at, to),
    );
  }

  /** Where `s`, a place as the cards are laid, lies in the layout's own places, before spreading. */
  private baseOf(s: { x: number; y: number }): { x: number; y: number } {
    const { spread, cx, cy } = this.cards?.laid ?? { spread: 1, cx: 0, cy: 0 };
    return { x: cx + (s.x - cx) / spread, y: cy + (s.y - cy) / spread };
  }

  /**
   * Puts each card of `to` at its place `s`, pinned there by hand at `p`, or given back to the layout with none. Each is
   * saved, and the cards round them make room.
   */
  private put(to: ReadonlyMap<string, { p: { x: number; y: number } | undefined; s: Spot }>): void {
    const places = placesOf(this.graph);
    for (const [k, { p }] of to) {
      if (p) places.set(k, p);
      else places.delete(k);
      this.save(k);
    }
    this.stop();
    const spots = new Map(this.cards?.laid.spots ?? []);
    for (const [k, { s }] of to) spots.set(k, s);
    this.relay([...to.keys()], spots);
  }

  /** Offers the undo of a move, said as `said`; the undo shares the history of the dots' moves. */
  private offer(said: string, undo: () => void, redo: () => void): void {
    const h = this.host;
    if (!h) return;
    this.undoes ??= new MoveUndo(h.viewport, this.graph);
    this.undoes.offer(said, undo, redo);
  }

  /** Marks each card put by hand with its pin. */
  private markPins(): void {
    this.cards?.mark('is-pinned', new Set(placesOf(this.graph).keys()));
  }

  /** Pins each card of `keys` where it is now, so laying the cards again never moves it. */
  pin(keys: readonly string[]): void {
    const cards = this.cards;
    if (!cards || cards.laid.only) return;
    const places = placesOf(this.graph);
    const fresh = keys.filter((k) => !places.has(k) && cards.laid.spots.has(k));
    for (const k of fresh) {
      places.set(k, this.baseOf(cards.laid.spots.get(k) as Spot));
      this.save(k);
    }
    this.markPins();
    if (fresh.length)
      this.offer(
        word('view.cards.pinned', { count: fresh.length }),
        () => this.unpinNow(fresh),
        () => this.pin(fresh),
      );
  }

  /** Gives each card of `keys` back to the layout: it glides to where the layout puts it, and the move undoes. */
  unpin(keys: readonly string[]): void {
    const places = placesOf(this.graph),
      was = keys.filter((k) => places.has(k)).map((k) => [k, places.get(k), this.cards?.laid.spots.get(k)] as const);
    if (!was.length || !this.unpinNow(keys)) return;
    const back = new Map(was.flatMap(([k, p, s]) => (s ? [[k, { p, s: { ...s } }] as const] : [])));
    this.offer(
      word('view.cards.unpinned', { count: was.length }),
      () => this.put(back),
      () => this.unpinNow(keys),
    );
  }

  /** Gives the cards `keys` back to the layout, with no undo offered; says whether any was pinned. */
  private unpinNow(keys: readonly string[]): boolean {
    const [h, cards, places] = [this.host, this.cards, placesOf(this.graph)];
    if (!h || !cards) return false;
    // where the layout lays each card now, round the cards still put by hand; only these cards go there
    const rest = new Map([...places].filter(([k]) => !keys.includes(k)));
    const fresh = withHands({ ...h, places: rest }, layCards(h, cards.base));
    const { spread, cx, cy } = cards.laid;
    const home = new Map<string, { p: undefined; s: Spot }>();
    for (const k of keys) {
      const f = fresh.spots.get(k);
      if (!places.has(k) || !f) continue;
      const [bx, by] = [fresh.cx + (f.x - fresh.cx) / fresh.spread, fresh.cy + (f.y - fresh.cy) / fresh.spread];
      home.set(k, { p: undefined, s: { ...f, x: cx + (bx - cx) * spread, y: cy + (by - cy) * spread } });
    }
    if (home.size) this.put(home);
    return home.size > 0;
  }

  /** Stops a glide under way and takes the cards away, as the stage goes. */
  remove(): void {
    this.stop();
    this.choose([]);
    this.cards?.remove();
    this.button?.remove();
  }
}
