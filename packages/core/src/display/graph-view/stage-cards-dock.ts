// The dock's Cards button, and the arrangements of the cards saved by name (render_cards). Roger, 15 Nov 2026: "start
// customising the view, positioning and layout". An arrangement keeps every card's size, width and pin. It is saved
// in the layout block, and put back in one step, which one undo takes back.
import type { CardSave } from '../../layout-block.ts';
import { word } from '../../words.ts';
import { button } from '../button.ts';
import type { CardWords } from './stage-cards.ts';
import { cardsChosen, chooseCards, fitsOf, placesOf, widthsOf } from './stage-cards-fit.ts';
import { layCards, withHands } from './stage-cards-lay.ts';
import type { CardsSwitch } from './stage-cards-switch.ts';

/** The arrangements of each graph's cards, by name, as last read from its note or saved since. */
const SETS = new Map<string, Map<string, ReadonlyMap<string, CardSave>>>();

/** The arrangements read from a note already, so those saved since are kept until the note is read anew. */
const READ = new WeakSet<object>();

/** The arrangements of graph `graph`'s cards; read anew from the note when it has them, for the note is the truth. */
function setsOf(sw: CardsSwitch): Map<string, ReadonlyMap<string, CardSave>> {
  const saved = sw.host?.saves?.arrangements;
  if (saved && !READ.has(saved)) (READ.add(saved), SETS.set(sw.graph, new Map(saved)));
  const had = SETS.get(sw.graph) ?? new Map<string, ReadonlyMap<string, CardSave>>();
  SETS.set(sw.graph, had);
  return had;
}

/** Every card on the stage as it is now: its place in the layout's own places, its size, width and pin. */
export function arrangementNow(sw: CardsSwitch): Map<string, CardSave> {
  const out = new Map<string, CardSave>();
  for (const c of sw.cards?.laid.cards ?? []) {
    const s = sw.cardSave(c.key, true);
    if (s) out.set(c.key, s);
  }
  return out;
}

/**
 * Sizes and puts every card as `cards` holds it. A card it holds pinned stays where it says. The rest go where the
 * layout lays them. With `keep`, each card is saved too; else the host saves them all in one write.
 */
export function arrange(sw: CardsSwitch, cards: ReadonlyMap<string, CardSave>, keep: boolean): void {
  const [h, laid] = [sw.host, sw.cards];
  if (!h || !laid) return;
  const [fits, places, widths] = [fitsOf(sw.graph), placesOf(sw.graph), widthsOf(sw.graph)];
  for (const m of [fits, places, widths]) m.clear();
  for (const [k, c] of cards) {
    if (c.fit) fits.set(k, { fit: c.fit, ...(c.h && { tall: c.h }) });
    if (c.placed) places.set(k, { x: c.x, y: c.y });
    if (c.w) widths.set(k, c.w);
  }
  sw.stop();
  // where the layout lays each card now, round the cards pinned, at the spread the cards have
  const fresh = withHands(h, layCards(h, laid.base)),
    { spread, cx, cy } = laid.laid,
    spots = new Map(laid.laid.spots);
  for (const [k, f] of fresh.spots) {
    const [bx, by] = [fresh.cx + (f.x - fresh.cx) / fresh.spread, fresh.cy + (f.y - fresh.cy) / fresh.spread];
    spots.set(k, { ...f, x: cx + (bx - cx) * spread, y: cy + (by - cy) * spread });
  }
  sw.relay([...spots.keys()], spots);
  if (keep) for (const k of spots.keys()) sw.save(k);
}

/** The bar of arrangements in `viewport`: pick one to use it, save this one by a name, or forget the one picked. */
function setsBar(sw: CardsSwitch, viewport: HTMLElement): HTMLElement {
  const bar = viewport.createDiv({ cls: 'thoughtknot-stage-cards-sets' });
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', word('view.cards.sets'));
  const sets = setsOf(sw);
  const list = bar.createEl('select', { attr: { 'aria-label': word('view.cards.sets.pick') } });
  list.createEl('option', { text: word('view.cards.sets.pick'), attr: { value: '' } });
  for (const name of sets.keys()) list.createEl('option', { text: name, attr: { value: name } });
  list.addEventListener('change', () => list.value && useSet(sw, list.value));
  button(bar, word('view.cards.sets.save'), 'bookmark', () => askName(bar, (name) => saveSet(sw, name)));
  button(bar, word('view.cards.sets.forget'), 'trash-2', () => list.value && forgetSet(sw, list.value));
  for (const b of bar.querySelectorAll('button')) b.setAttribute('title', b.getAttribute('aria-label') ?? '');
  // the bar's own presses stay its own: the stage under it would take them as a pan or a click
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  return bar;
}

/** Asks in `bar` for the name to save the arrangement by; Enter or its Save saves it. */
function askName(bar: HTMLElement, save: (name: string) => void): void {
  bar.querySelector('.thoughtknot-stage-cards-name')?.remove();
  const box = bar.createDiv({ cls: 'thoughtknot-stage-cards-name' });
  const input = box.createEl('input', { attr: { type: 'text', 'aria-label': word('view.cards.sets.name') } });
  const go = (): void => void (input.value.trim() && save(input.value.trim()));
  button(box, word('view.cards.sets.keep'), 'check', go, word('view.cards.sets.keep'));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    go();
  });
  input.focus();
}

/** Puts arrangement `name` in use, saved in one write; one undo puts the cards back as they were. */
export function useSet(sw: CardsSwitch, name: string): void {
  const cards = setsOf(sw).get(name);
  if (!cards) return;
  const was = arrangementNow(sw);
  const write = sw.host?.saves?.arrange;
  arrange(sw, cards, !write);
  if (write) void write(name, 'use');
  sw.offer(
    word('view.cards.sets.used', { name }),
    () => arrange(sw, was, true),
    () => arrange(sw, cards, true),
  );
}

/** Saves the cards as they are now as arrangement `name`, in place of one by that name; its undo puts that back. */
export function saveSet(sw: CardsSwitch, name: string): void {
  const sets = setsOf(sw);
  const [had, now] = [sets.get(name) ?? null, arrangementNow(sw)];
  const put = (cards: ReadonlyMap<string, CardSave> | null): void => {
    if (cards) sets.set(name, cards);
    else sets.delete(name);
    void sw.host?.saves?.arrange?.(name, cards);
    reopen(sw);
  };
  put(now);
  sw.offer(
    word('view.cards.sets.saved', { name }),
    () => put(had),
    () => put(now),
  );
}

/** Forgets arrangement `name`; its undo saves it again. */
export function forgetSet(sw: CardsSwitch, name: string): void {
  const sets = setsOf(sw);
  const had = sets.get(name);
  if (!had) return;
  const put = (cards: ReadonlyMap<string, CardSave> | null): void => {
    if (cards) sets.set(name, cards);
    else sets.delete(name);
    void sw.host?.saves?.arrange?.(name, cards);
    reopen(sw);
  };
  put(null);
  sw.offer(
    word('view.cards.sets.forgot', { name }),
    () => put(had),
    () => put(null),
  );
}

/** The bar of arrangements open on each stage's cards. */
const BARS = new WeakMap<CardsSwitch, HTMLElement>();

/** Opens the bar of arrangements over `sw`'s cards, or closes it when open; says whether it is open now. */
export function toggleSets(sw: CardsSwitch, open = !BARS.get(sw)?.isConnected): boolean {
  BARS.get(sw)?.remove();
  BARS.delete(sw);
  const viewport = sw.host?.viewport;
  if (!open || !viewport || !sw.cards) return false;
  BARS.set(sw, setsBar(sw, viewport));
  return true;
}

/** The bar drawn again, when open, so its list says the arrangements saved now. */
const reopen = (sw: CardsSwitch): void => void (BARS.get(sw)?.isConnected && toggleSets(sw, true));

/**
 * The dock's Cards button in `root`, for `stage`, on graph `graph`: pressed, each item shows as a card with its whole
 * note. The choice is kept for the graph, so a card drawn again, as typing draws it, opens as it was left. Beside it,
 * while the cards show, is the button of their arrangements.
 */
export function cardsControl(
  root: HTMLElement,
  stage: { showCards: (on: boolean, atOnce?: boolean) => void; cardsOn: CardsSwitch },
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
    sets.hidden = !on;
    if (!on) toggleSets(stage.cardsOn, false);
    stage.showCards(on);
  });
  const sets = button(body, word('view.cards.sets'), 'bookmark', () => {
    sets.setAttribute('aria-pressed', String(toggleSets(stage.cardsOn)));
  });
  stage.cardsOn.button = b; // the stage's unload takes them away
  stage.cardsOn.sets = sets;
  for (const x of [b, sets]) x.setAttribute('title', x.getAttribute('aria-label') ?? '');
  b.setAttribute('aria-pressed', String(cardsChosen(graph)));
  sets.setAttribute('aria-pressed', 'false');
  sets.hidden = !cardsChosen(graph);
  if (cardsChosen(graph)) stage.showCards(true, true);
  return { unload: () => (b.remove(), sets.remove()) };
}
