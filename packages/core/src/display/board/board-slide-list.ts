// The Slides list of a board (editor spec §45, board_slides; panels start small). One button beside Present opens a
// short list of the frames in the order they play, then the frames left out of the show.
//
// A press on a slide's name brings its frame into view. Each row steps its slide earlier or later, or leaves it out
// of the show and puts it back. Only the order is written: no frame moves on the board (nodes stay put).
import { word } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import type { BoardChange } from '../../board-edit.ts';
import { slideRows, type SlideRow } from '../../board-slides.ts';
import { button } from '../button.ts';

/** What the list needs of its board. */
export interface SlideBoard {
  /** Writes a change and draws what was written. */
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
  board: () => Board;
  /** Brings an item into view and puts the keyboard on it. */
  choose: (id: string) => void;
}

type Does = 'earlier' | 'later' | 'skip' | 'unskip';

/** Whether each board's list was left open, by the board's name, for when it is drawn again. */
const opened = new Map<string, boolean>();

/** The list: one fold button and, open, a row for each frame. */
export class SlideList {
  private readonly fold: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly h: SlideBoard;

  /** The fold button is put in `row`, beside the Present button; the list opens under it, over the board. */
  constructor(row: HTMLElement, h: SlideBoard) {
    this.h = h;
    this.fold = button(row, '', 'square-stack', () => this.open(!!this.panel.hidden));
    this.fold.addClass('thoughtknot-board-slides-fold');
    this.fold.setAttribute('title', word('board.slides.tip'));
    this.panel = row.createDiv({
      cls: 'thoughtknot-board-layers-list',
      attr: { role: 'group', 'aria-label': word('board.slides') },
    });
    row.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || this.panel.hidden) return;
      e.preventDefault();
      this.open(false);
      this.fold.focus();
    });
    this.open(opened.get(h.board().name) ?? false);
  }

  /** The list drawn again from the board. */
  paint(): void {
    const rows = slideRows(this.h.board());
    const open = !this.panel.hidden;
    this.fold.setAttribute('aria-expanded', String(open));
    this.fold.setAttribute('aria-label', word(open ? 'board.slides.hide' : 'board.slides.show'));
    if (!open) return;
    const held = (this.panel.ownerDocument.activeElement as HTMLElement | null)?.getAttribute?.('data-slide-do');
    this.panel.replaceChildren();
    if (!rows.length) this.panel.createEl('p', { text: word('board.present.none') });
    const list = this.panel.createEl('ol');
    const last = rows.filter((r) => r.n !== null).length;
    for (const r of rows) this.row(list, r, last);
    // the keyboard stays on the button it was on, though the list was drawn again
    if (held) this.panel.querySelector<HTMLElement>(`[data-slide-do="${held}"]`)?.focus();
  }

  private open(open: boolean): void {
    this.panel.hidden = !open;
    opened.set(this.h.board().name, open);
    this.paint();
  }

  /** Writes a change to the show, then draws the list again if the board was not drawn afresh with a new one. */
  private set(change: BoardChange): void {
    void this.h.write(change).then(() => {
      if (this.panel.isConnected) this.paint();
    });
  }

  /** One row: the slide's number and title, then earlier, later, and out of the show or back in. */
  private row(list: HTMLElement, r: SlideRow, last: number): void {
    const li = list.createEl('li', { cls: 'thoughtknot-board-layer' });
    if (r.n === null) li.addClass('is-hidden');
    const text =
      r.n === null ? word('board.slides.row-out', { title: r.title }) : word('board.slides.row', { ...r, n: r.n });
    const name = li.createEl('button', {
      cls: 'thoughtknot-board-layer-name',
      text,
      attr: { type: 'button', title: word('board.slides.go.tip') },
    });
    name.setAttribute('data-slide-do', `go:${r.id}`);
    name.addEventListener('click', () => this.h.choose(r.id));
    const tool = (what: Does, icon: string, run: () => void, off = false) => {
      const b = button(li, word(`board.slides.${what}`, { title: r.title }), icon, run);
      b.setAttribute('title', word(`board.slides.${what}`, { title: r.title }));
      b.setAttribute('data-slide-do', `${what}:${r.id}`);
      b.disabled = off;
    };
    const { id, n } = r;
    if (n === null) return tool('unskip', 'eye-off', () => this.set({ kind: 'slide-skip', id, skip: false }));
    tool('earlier', 'chevron-up', () => this.set({ kind: 'slide-step', id, by: -1 }), n === 1);
    tool('later', 'chevron-down', () => this.set({ kind: 'slide-step', id, by: 1 }), n === last);
    tool('skip', 'eye', () => this.set({ kind: 'slide-skip', id, skip: true }));
  }
}
