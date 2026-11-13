// The new rendering's card view (editor spec §73, render_cards). With Cards on, each item is drawn as a card holding its
// whole note. The card lies over the stage's canvas at the item's place. The links between items are arrows from card
// edge to card edge, round the other cards (render-cards.ts). Groups keep their clouds and roads. A card shows as its item
// would: it fades in as the zoom reaches the items. Far out it shows only its name. The pointer passes through the
// cards, so the stage still pans, zooms and picks; a click on a card picks its item.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from '../../note-reading.ts';
import { valueText } from '../../inline-properties.ts';
import { CARD_PROPS, CARD_W, type CardText, type CardsLaid } from '../../render/render-cards.ts';
import type { Mark, View } from '../../render/render-marks.ts';
import type { Look } from '../../render/render-look.ts';
import type { Spot } from '../../render/render-rooms.ts';
import { onScreen } from '../../render/render-tilt.ts';
import { isGlobe } from '../../render/render-globe.ts';
import { word } from '../../words.ts';
import { Lifecycle } from '../lifecycle.ts';

/** Below this alpha a card is not shown. */
const SHOWN = 0.05;
/** The widths on screen, in pixels, over which the cards fade in, in place of their items' dots. */
const FADE_FROM = 48;
const FADE_TO = 96;
/** Below this width on screen, in pixels, a card shows only its name. */
const FAR_PX = 150;

/** How clearly the cards show at zoom `scale`: not at all far out, where dots stand for them, then fading in. */
export const cardAlpha = (scale: number): number =>
  Math.min(1, Math.max(0, (CARD_W * scale - FADE_FROM) / (FADE_TO - FADE_FROM)));
/** Where `p` lies on the screen under `view`, at depth `depth`, and how much a card there is scaled: tilt and globe too. */
const seen = (p: [number, number], view: View, depth = 0) => onScreen({ x: p[0], y: p[1], r: 1 }, view, depth);
/** How many pieces each leg of an arrow is cut into on the globe, so it bends with the ball. */
const GLOBE_PIECES = 8;

/** An arrow's way on the screen under `view`, at `depth`; none if any of it is round the back of the globe. */
function wayOnScreen(way: readonly [number, number][], view: View, depth = 0): [number, number][] | null {
  const pieces = isGlobe(view) ? GLOBE_PIECES : 1;
  const out: [number, number][] = [];
  for (let i = 0; i < way.length; i++) {
    const [p, q] = [way[i] as [number, number], way[i + 1]];
    for (let j = 0; j < (q ? pieces : 1); j++) {
      const t = j / pieces;
      const s = seen(q ? [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] : p, view, depth);
      if (s.behind) return null;
      out.push([s.x, s.y]);
    }
  }
  return out;
}
/** The radius of an arrow's corners, and the length of its head, in screen pixels. */
const CORNER_PX = 8;
const HEAD_PX = 7;
/** The properties a card never lists: those that say where it sits or what it is, already shown. */
const UNLISTED = new Set(['name', 'id', 'subject', 'area', 'topic', 'text']);

/** Whether Cards is on for each graph, by its name, while the plugin runs: a card drawn again keeps it. */
const chosen = new Map<string, boolean>();
/** Whether Cards is on for `graph`. */
export const cardsChosen = (graph: string): boolean => chosen.get(graph) ?? false;
/** Keeps whether Cards is on for `graph`. */
export const chooseCards = (graph: string, on: boolean): void => void chosen.set(graph, on);

/**
 * What the host gives the cards: Markdown rendered as a note is, made safe, and for a thing that is a note, that note
 * to embed. Without it, a card shows its words as plain text.
 */
export interface CardWords {
  render?: (markdown: string, el: HTMLElement, owner: Lifecycle) => Promise<void>;
  /** The Markdown that embeds the note thing `key` is, or links to; none for a thing that is no note. */
  linked?: (key: string) => string | undefined;
}

/** What each item's card shows: its name, kind, own note, linked note and first properties (`drawing`, graph `g`). */
export function cardTexts(drawing: GraphDrawing, g?: Graph, words?: CardWords): Map<string, CardText> {
  const out = new Map<string, CardText>();
  for (const b of drawing.boxes) {
    const props = Object.entries(g?.nodes.has(b.key) ? g.p(b.key) : {})
      .filter(([k, v]) => !UNLISTED.has(k) && v !== undefined && v !== null)
      .slice(0, CARD_PROPS)
      .map(([k, v]) => [k, valueText(v)] as const);
    const kind = b.kind.split('.').filter(Boolean).join(' · ');
    out.set(b.key, {
      key: b.key,
      name: b.text || b.key,
      ...(kind ? { kind } : {}),
      ...(b.note?.text ? { note: b.note.text } : {}),
      ...((linked) => (linked ? { linked, linkedTall: true } : {}))(words?.linked?.(b.key)),
      ...(props.length ? { props } : {}),
    });
  }
  return out;
}

/** How clear the outermost groups' clouds stay under the cards: faint, so the cards read first. */
const CLOUD_UNDER = 0.3;

/**
 * The marks the stage paints under the cards, once they show: only the clouds of the outermost groups, faint. The
 * cards and their arrows say the rest, so no name, dot or road shows through them.
 */
export function underCards(marks: readonly Mark[], outer: ReadonlySet<string>): Mark[] {
  return marks.flatMap((m): Mark[] =>
    m.kind === 'cloud' && outer.has(m.key)
      ? [{ ...m, alpha: m.alpha * CLOUD_UNDER, ring: (m.ring ?? 0) * CLOUD_UNDER }]
      : m.kind === 'ground'
        ? [m]
        : [],
  );
}

/** A card's text as plain paragraphs, each set as text so nothing in a note runs as the page's own. */
function fill(el: HTMLElement, markdown: string): void {
  for (const para of markdown.split(/\n\s*\n/)) {
    const text = para.replace(/^\s*[-*+]\s+/gm, '• ').trim();
    if (text) el.createEl('p', { text });
  }
}

/** The cards of a laid-out drawing, over the stage's canvas in `viewport`. */
export class StageCards {
  readonly layer: HTMLElement;
  private readonly els = new Map<string, HTMLElement>();
  /** The outermost groups, whose clouds stay faint under the cards. */
  private readonly outer: Set<string>;
  /** Each card's box on the screen, as last drawn, top card last, for a click to pick from. */
  private boxes: { key: string; x: number; y: number; w: number; h: number }[] = [];

  /** Each card's body and the words it waits to show, and the cards whose words are in. */
  private readonly bodies = new Map<string, { body: HTMLElement; words: string[] }>();
  private readonly filled = new Set<string>();
  /** What the host rendered into the cards is owned here, and unloaded with them. */
  private readonly owner = new Lifecycle();
  private readonly words: CardWords | undefined;

  /** Whether the cards have come to rest: their arrows wait until then. */
  settled = false;

  readonly laid: CardsLaid;
  /** The places the stage draws now, which the cards follow as they glide. */
  private readonly spots: ReadonlyMap<string, Spot>;
  /** The layout's own places, from before the cards spread them: where Cards off goes back to. */
  readonly base: ReadonlyMap<string, Spot>;

  constructor(
    viewport: HTMLElement,
    laid: CardsLaid,
    spots: ReadonlyMap<string, Spot>,
    base: ReadonlyMap<string, Spot>,
    outer: readonly string[] = [],
    words?: CardWords,
  ) {
    [this.laid, this.spots, this.base, this.words] = [laid, spots, base, words];
    this.owner.load();
    this.outer = new Set(outer);
    this.layer = viewport.createDiv({ cls: 'thoughtknot-stage-cards' });
    this.layer.setAttribute('aria-hidden', 'true'); // the canvas names the drawing; the details read a thing out
    for (const c of laid.cards) {
      const el = this.layer.createDiv({ cls: 'thoughtknot-stage-card' });
      el.setCssProps({ '--thoughtknot-card-w': `${c.w}px`, '--thoughtknot-card-h': `${c.h}px` });
      const head = el.createDiv({ cls: 'thoughtknot-stage-card-head' });
      head.createSpan({ cls: 'thoughtknot-stage-card-name', text: c.text.name });
      if (c.text.kind) head.createSpan({ cls: 'thoughtknot-stage-card-kind', text: c.text.kind });
      const words = [c.text.note, c.text.linked].filter((t): t is string => !!t?.trim());
      if (words.length || c.text.props?.length) {
        const body = el.createDiv({ cls: 'thoughtknot-stage-card-body' });
        this.bodies.set(c.key, { body, words });
        if (c.more) body.addClass('is-cut');
        if (c.more) this.showAll(el, body, c.more);
        if (c.text.props?.length) {
          const props = el.createDiv({ cls: 'thoughtknot-stage-card-props' });
          for (const [k, v] of c.text.props) props.createDiv({ text: `${k} ${v}` });
        }
      }
      this.els.set(c.key, el);
    }
  }

  /** The card's Show all: it opens the card in place, above the cards round it, and nothing else moves. */
  private showAll(el: HTMLElement, body: HTMLElement, more: number): void {
    const b = el.createEl('button', {
      cls: 'thoughtknot-stage-card-more',
      text: word('view.cards.more', { count: more }),
      // the layer is hidden from screen readers, so its button stays out of the tab order too
      attr: { type: 'button', tabindex: '-1', 'aria-expanded': 'false' },
    });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !el.hasClass('is-open');
      el.toggleClass('is-open', open);
      b.setAttribute('aria-expanded', String(open));
      body.toggleClass('is-cut', !open);
      b.setText(open ? word('view.cards.less') : word('view.cards.more', { count: more }));
      if (open) this.layer.appendChild(el); // the open card stands on top
    });
  }

  /** A card's words, put in the first time it is near enough to read: rendered by the host, or as plain text. */
  private fillIn(key: string): void {
    const it = this.bodies.get(key);
    if (!it || this.filled.has(key)) return;
    this.filled.add(key);
    for (const t of it.words) {
      const el = it.body.createDiv({ cls: 'thoughtknot-stage-card-words' });
      if (this.words?.render) void this.words.render(t, el, this.owner);
      else fill(el, t);
    }
  }

  /** Whether wheel event `e` is over an open card, which scrolls its own words rather than zooming. */
  scrolls(e: Event): boolean {
    return !!(e.target as Element | null)?.closest?.('.thoughtknot-stage-card.is-open');
  }

  /**
   * The marks to paint under the cards in `view`. While the cards are faint, the dots and names still show; so do they
   * all when only the chosen thing has a card.
   */
  under(marks: readonly Mark[], view: View): Mark[] {
    return this.laid.only || cardAlpha(view.scale) < 0.5 ? [...marks] : underCards(marks, this.outer);
  }

  /**
   * Places each card over its item under `view`, in the colour `colour` gives it, and paints the arrows on `c`, under
   * the cards. `selected` is the item chosen now, whose card is marked. Tilted or on the globe, a card faces the
   * reader at its item's place, nearer ones larger. One round the back of the globe is hidden.
   */
  draw(
    view: View,
    look: Look,
    c: CanvasRenderingContext2D | null,
    colour: (key: string) => string | undefined,
    selected?: string | null,
  ): void {
    this.boxes = [];
    for (const card of this.laid.cards) {
      const el = this.els.get(card.key) as HTMLElement;
      const at = this.spots.get(card.key) ?? card;
      const s = seen([at.x, at.y], view, this.laid.depths.get(card.key));
      const [k, alpha] = [s.r, s.behind ? 0 : cardAlpha(s.r)];
      const [x, y, w, h] = [s.x - (card.w / 2) * k, s.y - (card.h / 2) * k, card.w * k, card.h * k];
      const chosen = !this.laid.only || selected === card.key;
      const on = chosen && alpha >= SHOWN && x < view.w && y < view.h && x + w > 0 && y + h > 0;
      el.hidden = !on;
      if (!on) continue;
      el.setCssProps({
        '--thoughtknot-card-x': `${x}px`,
        '--thoughtknot-card-y': `${y}px`,
        '--thoughtknot-card-k': String(k),
        '--thoughtknot-card-z': String(Math.round(k * 1000)), // tilted, the nearer card stands in front
        '--thoughtknot-card-alpha': String(alpha),
        '--thoughtknot-card-colour': colour(card.key) ?? look.faint,
      });
      el.toggleClass('is-far', w < FAR_PX);
      if (w >= FAR_PX) this.fillIn(card.key);
      el.toggleClass('is-selected', selected === card.key);
      // an open card grows to its words, so a click picks it over all it covers
      const tall = el.hasClass('is-open') ? Math.max(h, (el.offsetHeight || 0) * k) : h;
      if (alpha >= 0.5) this.boxes.push({ key: card.key, x, y, w, h: tall });
    }
    const alpha = cardAlpha(view.scale);
    if (c && this.settled && alpha >= SHOWN) this.arrows(c, view, look, alpha);
  }

  /** The arrows between the cards, as clear as the cards are, each with its head at its end. */
  private arrows(c: CanvasRenderingContext2D, view: View, look: Look, alpha: number): void {
    c.save();
    c.strokeStyle = c.fillStyle = look.ink;
    c.lineWidth = 1.5;
    for (const a of this.laid.arrows) {
      if (a.way.length < 2) continue;
      const pts = wayOnScreen(a.way, view, this.laid.depths.get(a.from));
      if (!pts) continue;
      c.globalAlpha = 0.55 * Math.min(1, alpha);
      c.beginPath();
      const [first] = pts as [[number, number]];
      c.moveTo(...first);
      for (let i = 1; i < pts.length - 1; i++)
        c.arcTo(...(pts[i] as [number, number]), ...(pts[i + 1] as [number, number]), CORNER_PX);
      const end = pts.at(-1) as [number, number],
        before = pts.at(-2) as [number, number];
      c.lineTo(...end);
      c.stroke();
      // the head: a small filled triangle pointing along the last piece
      const t = Math.atan2(end[1] - before[1], end[0] - before[0]);
      c.beginPath();
      c.moveTo(...end);
      c.lineTo(end[0] - HEAD_PX * Math.cos(t - 0.45), end[1] - HEAD_PX * Math.sin(t - 0.45));
      c.lineTo(end[0] - HEAD_PX * Math.cos(t + 0.45), end[1] - HEAD_PX * Math.sin(t + 0.45));
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  /** The item whose card is at `x`, `y` on the screen, the top card first; none off every card. */
  pickAt(x: number, y: number): string | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i] as (typeof this.boxes)[number];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.key;
    }
    return null;
  }

  /** Takes the cards away. */
  remove(): void {
    this.owner.unload();
    this.layer.remove();
  }
}
