// AI queries on a whiteboard (editor spec ES§75, on the board of ES§45). Roger, 22 Nov 2026: queries and their marks
// work on the board too. A board on a graph (`BOARD ON work`) gets the Filter panel of a card, over that graph:
// - Its button opens the same panel: ask in words, refine, lock, merge, save, open and Ask again (untangle-ask.ts).
// - A highlight marks each card linked to a thing it finds (board_graph_linked): a ring and a badge, by query-marks.ts.
// - A filter fades the cards linked to things it does not keep, or hides them. A card on no thing is left as it is.
// - A banner says what is shown, with the legend of its marks and Show all.
// Nothing moves, and nothing is written to the note but a query saved by name. Each send is the host's (ES§19).
import { word } from '../../words.ts';
import type { Graph } from '@thoughtknot/graph-spec';
import type { Board, BoardItem } from '../../board.ts';
import { itemBox } from '../../board-svg.ts';
import { gqlBlocks } from '../../fences.ts';
import { readNote } from '../../drawing.ts';
import { FIRST_MARK } from '../../filter.ts';
import type { Palette } from '../../palette.ts';
import { drawnOf, markedBy, QUERY_RINGS, queryLabel, queryLine } from '../../query-marks.ts';
import type { QueryMarkDrawn } from '../../query-marks.ts';
import { readStyle } from '../../style.ts';
import type { StyleGraph } from '../../style-graph.ts';
import { button } from '../button.ts';
import { askPanelOver } from '../graph-view/untangle-ask.ts';
import type { FilterAskHost, FilterAskPanel, ShownAsk } from '../graph-view/untangle-ask.ts';
import { markSaid, queryLegendIn } from '../graph-view/untangle-query-legend.ts';

/** What a board's queries need of the host: the graph the board is on, and, where it can, an AI and saved filters. */
export interface BoardAsk extends Pick<FilterAskHost, 'describe' | 'named'> {
  graph: Graph;
}

/** How the host gives a board's queries what they need, read when the panel first opens; null for none. */
export type BoardQueryHost = (board: Board) => Promise<BoardAsk | null>;

/** The SVG namespace, for the rings and badges added to a card. */
const SVG_NS = 'http://www.w3.org/2000/svg';
/** How a card that a filter does not keep is faded, drawn on it as the board draws its own looks. */
const FADED = '0.35';

/** The queries of each board, by its viewport, so its painter finds them when the picture is drawn again. */
const onBoards = new WeakMap<Element, BoardQueries>();
/** What each board shows, by its key, so it is shown still when a write to the note draws the board afresh. */
const shownOn = new Map<string, ShownAsk>();

/**
 * The graph `on` of `note`, and its style, which holds the filters and queries saved by name; null if not read.
 * `shared` are the vault's shared schemas, as the host reads them for a card.
 */
export function boardGraphIn(
  note: string,
  on: string,
  shared?: Parameters<typeof readNote>[2],
): { graph: Graph; style: StyleGraph } | null {
  const texts = gqlBlocks(note).map((b) => b.text);
  const reading = readNote(texts, undefined, shared);
  const graph = reading.world[on];
  return graph ? { graph, style: readStyle(texts, on, reading).style } : null;
}

/** A board's queries: its Filter button, the panel over its graph, its banner, and what it shows now. */
export class BoardQueries {
  private shown: ShownAsk | null = null;
  private panel: Promise<FilterAskPanel | null> | null = null;
  private readonly bar: HTMLElement;
  private readonly holder: HTMLElement;
  private readonly said: HTMLElement;
  private readonly line: HTMLElement;
  private readonly more: HTMLElement;

  /** Builds the button in `root` for the board in `vp`, which `redraw` draws again; nothing for a board on no graph. */
  static on(
    root: HTMLElement,
    vp: HTMLElement,
    host: { queries?: BoardQueryHost; palette: Palette; key: string },
    board: () => Board,
    redraw: () => void,
  ): void {
    if (host.queries && board().on) onBoards.set(vp, new BoardQueries(root, host, host.queries, board, redraw));
  }

  private constructor(
    root: HTMLElement,
    readonly where: { palette: Palette; key: string },
    private readonly host: BoardQueryHost,
    private readonly board: () => Board,
    private readonly redraw: () => void,
  ) {
    // an icon on the row above the board, after its own bar, so it takes no height of its own on a phone
    this.bar = createDivAfter(root, root.querySelector('.thoughtknot-board-bar'));
    const open = button(this.bar, word('bar.filter'), 'filter', () => void this.toggle(open));
    open.setAttribute('title', word('bar.filter'));
    open.setAttribute('aria-expanded', 'false');
    this.said = this.bar.createDiv({ cls: 'thoughtknot-board-queries-said' });
    this.line = this.said.createSpan({ attr: { role: 'status', 'aria-live': 'polite' } });
    this.more = this.said.createSpan();
    this.holder = root.createDiv({ cls: 'thoughtknot-board-queries', attr: { hidden: '' } });
    this.shown = shownOn.get(where.key) ?? null;
    this.banner();
  }

  /** Opens or closes the panel, built over the board's graph the first time; a board whose graph is gone says so. */
  private async toggle(b: HTMLElement): Promise<void> {
    this.holder.hidden = !this.holder.hidden;
    b.setAttribute('aria-expanded', String(!this.holder.hidden));
    if (this.holder.hidden) return;
    if (!this.panel) this.panel = this.built();
    const panel = await this.panel;
    if (panel) return panel.focus();
    // nothing to ask about: the panel stays closed, and the next press reads the note again
    this.panel = null;
    this.holder.hidden = true;
    b.setAttribute('aria-expanded', 'false');
    this.line.setText(word('board.query.no-graph', { graph: this.board().on ?? '' }));
  }

  /** The panel over the board's graph, counting every thing in it; null when the graph is not there. */
  private async built(): Promise<FilterAskPanel | null> {
    const ask = await this.host(this.board());
    if (!ask) return null;
    if (!this.shown) this.line.setText('');
    return askPanelOver(this.holder, ask.graph, new Set(ask.graph.nodes.keys()), ask, (a) => this.show(a));
  }

  /** Shows `asked` on the board, or nothing for null, and says what is shown. */
  private show(asked: ShownAsk | null): void {
    this.shown = asked;
    if (asked) shownOn.set(this.where.key, asked);
    else {
      shownOn.delete(this.where.key);
      void this.panel?.then((p) => p?.off());
    }
    this.banner();
    this.redraw();
  }

  /** The banner: what is shown, the legend of a highlight's marks, and Show all; empty while nothing is. */
  private banner(): void {
    this.line.setText('');
    this.more.empty();
    const a = this.shown;
    if (!a) return;
    const key = a.show === 'highlight' ? 'filter.query.banner' : 'filter.ask.banner';
    this.line.setText(word(key, { count: a.things.size, said: a.said }));
    if (a.legend) queryLegendIn(this.more, a.legend);
    button(this.more, word('filter.ask.off'), 'eye', () => this.show(null), word('filter.ask.off'));
  }

  /** Paints what is shown on the board's picture `svg`. */
  paint(svg: SVGSVGElement, board: Board): void {
    paintQueries(svg, board, this.shown, this.where.palette);
  }
}

/** The queries' bar, put after `after` in `root`, or first in it when `after` is not one of its own. */
function createDivAfter(root: HTMLElement, after: Element | null): HTMLElement {
  const bar = root.createDiv({ cls: 'thoughtknot-board-queries-bar' });
  const kids = Array.from(root.children);
  root.insertBefore(bar, kids[kids.indexOf(after as HTMLElement) + 1] ?? null);
  return bar;
}

/** Paints the queries of the board in `svg`'s viewport, if any, as its picture is drawn (board-view-items.ts). */
export function paintBoardQueries(svg: SVGSVGElement, board: Board): void {
  const vp = svg.parentElement;
  if (vp) onBoards.get(vp)?.paint(svg, board);
}

/**
 * Paints `shown` on the board's picture `svg`. A highlight rings and badges each card whose thing it finds. A filter
 * fades or hides each card whose thing it does not keep. A card on no thing is left as it is. Nothing is moved.
 */
export function paintQueries(svg: SVGSVGElement, board: Board, shown: ShownAsk | null, palette: Palette): void {
  if (!shown) return;
  const items = new Map(board.items.map((i) => [i.id, i] as const));
  const marked = shown.show === 'highlight' ? (shown.marked ?? markedBy(shown.things, FIRST_MARK)) : null;
  for (const g of Array.from(svg.querySelectorAll('[data-item]'))) {
    const item = items.get(g.getAttribute('data-item') ?? '');
    const thing = item?.graph;
    if (!item || thing === undefined) continue;
    if (!marked) {
      if (shown.things.has(thing)) continue;
      if (shown.hide) g.classList.add('thoughtknot-hidden');
      else g.classList.add('thoughtknot-dim');
      g.setAttribute('opacity', FADED);
      continue;
    }
    const marks = marked.get(thing);
    const d = drawnOf(marks);
    if (d && marks) markCard(g, item, d, palette, marks.map(markSaid).join(', '));
  }
}

/** Rings the card `g` of `item` just outside its box, with its badge at its top end, in the colours of `d`. */
function markCard(g: Element, item: BoardItem, d: QueryMarkDrawn, palette: Palette, said: string): void {
  const { x, y, w, h } = itemBox(item);
  g.classList.add('thoughtknot-query-marked');
  g.setAttribute('data-query-badge', d.glyph);
  const title = g.querySelector('title');
  if (title) title.textContent = `${title.textContent ?? ''} ${said}`;
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = g.appendChild(g.ownerDocument.createElementNS(SVG_NS, tag));
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  for (const at of QUERY_RINGS)
    add('rect', {
      class: 'thoughtknot-query-ring',
      x: String(x - at),
      y: String(y - at),
      width: String(w + at * 2),
      height: String(h + at * 2),
      fill: 'none',
      stroke: queryLine(d.hue, palette),
      'aria-hidden': 'true',
    });
  const badge = add('text', {
    class: 'thoughtknot-query-badge',
    x: String(x + w - 4),
    y: String(y + 14),
    'text-anchor': 'end',
    fill: queryLabel(d.hue, palette),
    'aria-hidden': 'true',
  });
  badge.textContent = d.glyph;
}
