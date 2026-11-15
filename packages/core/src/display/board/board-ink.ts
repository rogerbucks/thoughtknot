// Drawing on a board with a mouse, pen or finger (editor spec ES§45, board_ink). While the rail's Pen, Highlighter or
// Eraser is in use, a drag on the board draws a stroke, or rubs out the strokes it crosses. The pointer is taken
// before the board's own handlers see it, so the same press never moves or pans anything. A stroke is shown as it
// goes and written as one Ink item when it lifts. Strokes are written one after another, so two quick ones never
// share an id. Kept apart so board-view.ts stays small.
import { STYLE, word, type Palette, type Zoom } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { freeId, type BoardChange } from '../../board-edit.ts';
import { HIGHLIGHT_OPACITY, PEN_WIDTH, inkHit, inkItem, type Pen } from '../../board-ink.ts';
import { INK_TOOLS, type BoardTool } from '../../board-tools.ts';
import type { BoardSpace } from './board-space.ts';

const SVG = 'http://www.w3.org/2000/svg';
/** How far a pointer must go before another point is kept, in pixels on screen. */
const STEP_PX = 2;
/** How near the eraser's spot must be to a stroke to rub it out, in pixels on screen. */
const REACH_PX = 6;

/** What the drawing needs of the board's view (the arrange bar's hooks give it all). */
export interface InkHooks {
  board: () => Board;
  svg: () => SVGSVGElement | null;
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
}

/** One stroke under way: the pointer, the pen, the spots it went through, and the strokes an eraser has crossed. */
interface Stroke {
  pointer: number;
  tool: BoardTool;
  path: [number, number][];
  crossed: Set<string>;
}

/** The pen, highlighter and eraser of one board. */
export class BoardInk {
  private stroke: Stroke | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly vp: HTMLElement,
    private readonly palette: Palette,
    private readonly rail: { tool: BoardTool },
    private readonly space: BoardSpace,
    private readonly zoom: Zoom,
    private readonly host: InkHooks,
    private readonly readOnly: boolean,
  ) {
    // added before the board's own handlers, so a stroke's press is never also a drag or a pan
    vp.addEventListener('pointerdown', (e: PointerEvent) => this.down(e));
    vp.addEventListener('pointermove', (e: PointerEvent) => this.move(e));
    vp.addEventListener('pointerup', (e: PointerEvent) => this.lift(e));
    vp.addEventListener('pointercancel', (e: PointerEvent) => this.lift(e));
  }

  private down(e: PointerEvent): void {
    const tool = this.rail.tool;
    if (!INK_TOOLS.has(tool) || this.readOnly || e.button !== 0) return;
    if (this.stroke) return this.cancel(); // a second finger: it is a pinch, not a stroke
    e.stopImmediatePropagation();
    e.preventDefault();
    this.vp.setPointerCapture(e.pointerId);
    this.vp.focus({ preventScroll: true });
    const at = this.space.onBoard(this.space.point(e));
    this.stroke = { pointer: e.pointerId, tool, path: [at], crossed: new Set() };
    this.show();
  }

  private move(e: PointerEvent): void {
    const s = this.stroke;
    if (s?.pointer !== e.pointerId) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const at = this.space.onBoard(this.space.point(e)),
      last = s.path[s.path.length - 1] ?? at;
    if (Math.hypot(at[0] - last[0], at[1] - last[1]) * this.zoom.view().scale < STEP_PX) return;
    s.path.push(at);
    this.show();
  }

  private lift(e: PointerEvent): void {
    const s = this.stroke;
    if (s?.pointer !== e.pointerId) return;
    e.stopImmediatePropagation();
    if (e.type === 'pointerup') s.path.push(this.space.onBoard(this.space.point(e)));
    this.cancel();
    if (e.type === 'pointercancel') return;
    if (s.tool === 'eraser') return this.rub(s);
    const { path } = s;
    this.queue = this.queue.then(async () => {
      const item = inkItem(freeId(this.host.board(), 'Ink'), s.tool as Pen, path);
      if (!item) return;
      this.host.say(word('board.ink.drawn'));
      await this.host.write({ kind: 'add', item });
    });
  }

  /** The stroke as it is now: a pen shows its line; an eraser dims the strokes it has crossed. */
  private show(): void {
    const s = this.stroke,
      svg = this.host.svg();
    if (!s || !svg) return;
    if (s.tool === 'eraser') {
      const reach = REACH_PX / this.zoom.view().scale,
        at = s.path[s.path.length - 1] as [number, number];
      for (const item of this.host.board().items)
        if (item.kind === 'Ink' && !item.locked && inkHit(item, at, reach)) s.crossed.add(item.id);
      for (const id of s.crossed) svg.querySelector<SVGElement>(`[data-item="${id}"]`)?.classList.add('is-erased');
      return;
    }
    let line = svg.querySelector('.thoughtknot-ink-preview');
    if (!line) {
      line = svg.appendChild(svg.ownerDocument.createElementNS(SVG, 'polyline'));
      line.setAttribute('class', 'thoughtknot-ink-preview');
      const hi = s.tool === 'highlighter';
      line.setAttribute('stroke', hi ? this.palette.blend('yellow', STYLE.line_mix) : this.palette.text);
      if (hi) line.setAttribute('stroke-opacity', String(HIGHLIGHT_OPACITY));
      line.setAttribute('stroke-width', String(PEN_WIDTH[s.tool as Pen]));
      line.setAttribute('aria-hidden', 'true');
    }
    line.setAttribute('points', s.path.map(([x, y]) => `${x},${y}`).join(' '));
  }

  /** Lets go of the stroke under way, and takes its picture away. */
  private cancel(): void {
    const svg = this.host.svg();
    svg?.querySelector('.thoughtknot-ink-preview')?.remove();
    if (this.stroke?.tool === 'eraser' && svg)
      for (const id of this.stroke.crossed)
        svg.querySelector<SVGElement>(`[data-item="${id}"]`)?.classList.remove('is-erased');
    this.stroke = null;
  }

  /** The strokes the eraser crossed taken off the board, each as its own change so each can be undone. */
  private rub(s: Stroke): void {
    const ids = [...s.crossed];
    if (!ids.length) return;
    this.host.say(word('board.ink.erased', { count: ids.length }));
    for (const id of ids) this.queue = this.queue.then(() => this.host.write({ kind: 'remove', id }));
  }
}
