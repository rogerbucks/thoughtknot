// The "Arrange by graph" button of a board (editor spec §45, board_arranged_by_graph; ethos: never disorient the user).
// It moves nothing by itself. A press works the arrangement out (board-arrange.ts) and writes it as one change.
// Then each item glides from where it was to where it goes, and the links come back as the items arrive.
// A press, wheel or key ends the glide at once, and so does reduced motion. Undo puts every item back the same way.
import { word } from '@thoughtknot/core';

import type { Glide } from '../../board-arrange.ts';
import type { Fit } from '../../layouts/arrange-fit.ts';
import type { BoardChange } from '../../board-edit.ts';
import type { Board } from '../../board.ts';
import { LAYOUT_GLIDE_MS, easeGlide } from '../../layout-glide.ts';
import { reducedMotion } from '../graph-view/details-nav.ts';

/** What the host gives the button. */
export interface ArrangeHooks {
  /** Works out where the items go, or why not. */
  arrange: (only?: readonly string[]) => Promise<{ glide: Glide[]; how: Fit | 'picked' } | { refused: string }>;
}

/** What the button needs of its board. */
export interface ArrangeBoard {
  /** Writes a change and draws what was written. */
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
  board: () => Board;
  svg: () => SVGSVGElement | null;
  /** The items chosen, or none. */
  chosen: () => string[];
}

/** What ends a glide at once: the person reaching for the board. */
const REACHES = ['pointerdown', 'wheel', 'keydown'] as const;

/** What a board drawn afresh by its host picks up again, by the host's key: the undo, and a glide just started. */
const carried = new Map<string, { back: Glide[]; glide: Glide[]; at: number }>();
/** How long after a write a board drawn afresh still takes up its glide, in milliseconds. */
const FRESH_MS = 3000;

/** The words for how the items were arranged. */
const HOW = {
  grid: 'board.arrange.how.grid',
  tree: 'board.arrange.how.tree',
  flow: 'board.arrange.how.flow',
  cluster: 'board.arrange.how.cluster',
} as const;

/** The button, its undo, and the glide of the items arranged. */
export class ArrangeBar {
  private readonly undo: HTMLButtonElement;
  /** The moves that put the items back, or none once something else was changed. */
  private back: Glide[] = [];
  private run = 0;
  private own = false;
  private readonly go: HTMLButtonElement;
  private end: (() => void) | null = null;

  /** The viewport is listened to, so a reach for the board ends the glide. `key` names the board in its host. */
  constructor(
    el: HTMLElement,
    private readonly vp: HTMLElement,
    private readonly arrange: ArrangeHooks['arrange'],
    private readonly h: ArrangeBoard,
    private readonly key = '',
  ) {
    const bar = el.createDiv({ cls: 'thoughtknot-board-bar' });
    this.go = bar.createEl('button', {
      text: word('board.arrange.button'),
      attr: { title: word('board.arrange.tip') },
    });
    vp.parentElement?.insertBefore(bar, vp); // above the board
    this.undo = bar.createEl('button', { text: word('board.arrange.undo') });
    this.undo.hidden = true;
    const was = carried.get(key);
    if (was) {
      this.back = was.back;
      this.undo.hidden = !was.back.length;
      // the host drew the board afresh after the write: the items still glide, from the view now drawn
      if (Date.now() - was.at < FRESH_MS) queueMicrotask(() => this.glide(was.glide));
    }
    this.go.addEventListener('click', () => void this.press());
    this.undo.addEventListener('click', () => void this.put(this.back, 'board.arrange.undone'));
    for (const type of REACHES) vp.addEventListener(type, () => this.stop(), { capture: true });
  }

  /** How many items are chosen: the button says it arranges them, or the whole board when none are. */
  chosen(count: number): void {
    this.go.setText(word(count ? 'board.arrange.selected' : 'board.arrange.button', { count }));
  }

  /** Something else was changed: the arrangement is no longer one undo away. */
  forget(): void {
    if (this.own) return; // the arrangement's own write
    this.back = [];
    carried.delete(this.key);
    this.undo.hidden = true;
  }

  /** Ends the glide under way, every item where it goes. */
  stop(): void {
    this.run++;
    const end = this.end;
    this.end = null;
    end?.();
  }

  private async press(): Promise<void> {
    const r = await this.arrange(this.h.chosen());
    if ('refused' in r) return this.h.say(r.refused);
    await this.put(r.glide, r.how === 'picked' ? 'board.arrange.done' : 'board.arrange.done-as', r.how);
  }

  /** Writes each item at its `to` as one change, then glides the items that arrived there; says it as `said`. */
  private async put(
    glide: Glide[],
    said: 'board.arrange.done' | 'board.arrange.done-as' | 'board.arrange.undone',
    how: Fit | 'picked' = 'picked',
  ): Promise<void> {
    this.stop();
    const back = said === 'board.arrange.undone' ? [] : glide.map((g) => ({ id: g.id, from: g.to, to: g.from }));
    // set before the write: the host may draw the board afresh at once, and the new one picks these up
    carried.set(this.key, { back, glide, at: Date.now() });
    this.own = true;
    await this.h
      .write({ kind: 'moves', moves: glide.map((g) => ({ id: g.id, x: g.to[0], y: g.to[1] })) })
      .finally(() => {
        this.own = false;
      });
    const at = new Map(this.h.board().items.map((i) => [i.id, i]));
    const arrived = glide.filter((g) => at.get(g.id)?.x === g.to[0] && at.get(g.id)?.y === g.to[1]);
    if (arrived.length) this.h.say(word(said, { count: arrived.length, how: how === 'picked' ? '' : word(HOW[how]) }));
    this.glide(arrived);
    this.back = arrived.length ? back : [];
    this.undo.hidden = !this.back.length;
  }

  /** Each item eases from where it was to where it is drawn; the connectors fade in over the second half. */
  private glide(moved: Glide[]): void {
    const svg = this.h.svg(),
      win = this.vp.ownerDocument.defaultView;
    if (!svg || !win || !moved.length || reducedMotion(win)) return;
    const run = ++this.run;
    const items = moved.flatMap((g) => {
      const el = svg.querySelector<SVGGElement>(`[data-item="${g.id}"]`);
      return el
        ? [{ el, was: el.getAttribute('transform'), d: [g.from[0] - g.to[0], g.from[1] - g.to[1]] as const }]
        : [];
    });
    const links = Array.from(svg.querySelectorAll<SVGGElement>('[data-connector]'));
    const show = (t: number) => {
      const left = 1 - easeGlide(t);
      for (const { el, was, d } of items) {
        const by = `translate(${d[0] * left} ${d[1] * left})`;
        el.setAttribute('transform', was ? `${by} ${was}` : by);
      }
      for (const l of links) l.setCssStyles({ opacity: String(Math.max(0, easeGlide(2 * t - 1))) });
    };
    this.end = () => {
      for (const { el, was } of items) was ? el.setAttribute('transform', was) : el.removeAttribute('transform');
      for (const l of links) l.setCssStyles({ opacity: '' });
    };
    show(0);
    let start: number | null = null;
    const frame = (time?: number) => {
      if (run !== this.run) return;
      const now = typeof time === 'number' ? time : Date.now();
      start ??= now;
      const t = Math.min(1, (now - start) / LAYOUT_GLIDE_MS);
      if (t >= 1) return this.stop();
      show(t);
      win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
  }
}
