// A board presented as a slide show (editor spec §45, board_slides; ethos: never disorient the user). The Present
// button shows the board alone over the whole screen and glides the view from frame to frame. The arrow keys, Space,
// a press or a swipe go on; Escape ends the show.
//
// The show writes nothing and moves nothing on the board: only the view moves. When it ends, the view glides back to
// where it was, so the person is never left somewhere they did not go. Reduced motion shows each slide at once.
import { glideAt, MOVE_MS, word, type Zoom } from '@thoughtknot/core';

import type { Board, BoardItem } from '../../board.ts';
import { slideAt, slidePlace, slideSaid, slidesOf, type SlidePlace } from '../../board-slides.ts';
import { boardFrame, itemBox } from '../../board-svg.ts';
import { button } from '../button.ts';
import { reducedMotion } from '../graph-view/details-nav.ts';
import type { BoardSpace } from './board-space.ts';

/** What the show needs of its board. */
export interface PresentBoard {
  board: () => Board;
  say: (words: string) => void;
  /** The middle of the view, in board units: the show starts from the slide there. */
  centre: () => [number, number];
}

/** How far a finger goes across, in pixels, to count as a swipe and not a press. */
const SWIPE = 40;
/** The keys that go on, go back, and go to either end of the show. */
const ON = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']);
const BACK = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

/** The show of one board: its button, its bar while it plays, and the slide it is on. */
export class Presenter {
  /** The slide shown, from 0, or -1 when no show is on. */
  at = -1;
  private slides: BoardItem[] = [];
  /** The view before the show, to go back to. */
  private back: SlidePlace | null = null;
  private run = 0;
  private press: { x: number } | null = null;
  private readonly go: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private readonly count: HTMLElement;
  private readonly root: HTMLElement;
  private readonly vp: HTMLElement;
  private readonly h: PresentBoard;
  private readonly zoom: Zoom;
  private readonly space: BoardSpace;

  /** The button is put above the viewport `vp` of the board `root`; the bar is shown only while the show plays. */
  constructor(root: HTMLElement, vp: HTMLElement, h: PresentBoard, zoom: Zoom, space: BoardSpace) {
    this.root = root;
    this.vp = vp;
    this.h = h;
    this.zoom = zoom;
    this.space = space;
    const row = root.createDiv({ cls: 'thoughtknot-board-present' });
    vp.parentElement?.insertBefore(row, vp); // above the board
    this.go = button(row, word('board.present'), 'play', () => this.start());
    this.go.setAttribute('title', word('board.present.tip'));
    this.bar = root.createDiv({
      cls: 'thoughtknot-board-present-bar',
      attr: { role: 'toolbar', 'aria-label': word('board.present.bar') },
    });
    button(this.bar, word('board.present.prev'), 'chevron-left', () => this.show(this.at - 1));
    this.count = this.bar.createSpan({ cls: 'thoughtknot-board-present-count', attr: { 'aria-hidden': 'true' } });
    button(this.bar, word('board.present.next'), 'chevron-right', () => this.show(this.at + 1));
    button(this.bar, word('board.present.end'), 'x', () => this.stop());
    this.bar.hidden = true;
    // in the capture phase, so the board under the show never takes a key or a press meant for the show
    root.addEventListener('keydown', (e: KeyboardEvent) => this.key(e), true);
    root.addEventListener('pointerdown', (e: PointerEvent) => this.down(e), true);
    root.addEventListener('pointerup', (e: PointerEvent) => this.lift(e), true);
    root.ownerDocument.addEventListener('fullscreenchange', () => {
      if (this.at >= 0 && !root.ownerDocument.fullscreenElement) this.stop(); // the browser's own way out
    });
  }

  /** Starts the show at the slide the person is looking at; a board with no frame says how to make a slide. */
  start(): void {
    if (this.at >= 0) return;
    this.slides = slidesOf(this.h.board());
    if (!this.slides.length) return this.h.say(word('board.present.none'));
    const first = slideAt(this.slides, this.h.centre());
    const v = this.zoom.view();
    this.back = { scale: v.scale, x: v.x, y: v.y };
    this.root.addClass('thoughtknot-board-show');
    this.bar.hidden = false;
    this.space.full = this.root;
    void this.root.requestFullscreen?.()?.catch?.(() => undefined); // where there is none, the board still fills the page
    this.zoom.resize(this.space.size());
    this.at = first;
    this.show(first);
    this.vp.focus({ preventScroll: true });
  }

  /** Shows slide `to`, gliding there; past either end the show stays where it is. */
  show(to: number): void {
    const slide = this.slides[to];
    if (this.at < 0 || !slide) return;
    this.at = to;
    this.count.setText(word('board.present.count', { n: to + 1, of: this.slides.length }));
    this.h.say(slideSaid(this.slides, to));
    this.zoom.resize(this.space.size()); // the screen may have turned or gone full since
    this.glide(slidePlace(itemBox(slide), boardFrame(this.h.board()), this.space.size()));
  }

  /** Ends the show: the board comes back with its bars, and the view glides to where it was. */
  stop(): void {
    if (this.at < 0) return;
    this.at = -1;
    this.root.removeClass('thoughtknot-board-show');
    this.bar.hidden = true;
    this.space.full = null;
    const doc = this.root.ownerDocument;
    if (doc.fullscreenElement === this.root) void doc.exitFullscreen?.()?.catch?.(() => undefined);
    this.zoom.resize(this.space.size());
    if (this.back) this.glide(this.back);
    this.h.say(word('board.present.ended'));
    this.go.focus();
  }

  /** Moves the view to `to`: eased, a frame at a time, or at once where motion is to be still. */
  private glide(to: SlidePlace): void {
    const run = ++this.run;
    const win = this.vp.ownerDocument.defaultView;
    if (!win || reducedMotion(win)) return this.zoom.place(to.scale, to.x, to.y);
    const v = this.zoom.view();
    const from = { scale: v.scale, x: v.x, y: v.y };
    let start: number | null = null;
    const frame = (time: number) => {
      if (run !== this.run) return;
      start ??= time;
      const t = (time - start) / (MOVE_MS * 2);
      const at = glideAt(from, to, t);
      this.zoom.place(at.scale, at.x, at.y);
      if (t < 1) win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
  }

  private key(e: KeyboardEvent): void {
    if (this.at < 0 || (e.target as Element | null)?.closest?.('.thoughtknot-board-present-bar')) return;
    const to = ON.has(e.key)
      ? this.at + 1
      : BACK.has(e.key)
        ? this.at - 1
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? this.slides.length - 1
            : null;
    if (to === null && e.key !== 'Escape' && e.key !== 'Tab') return void e.stopPropagation(); // not the board's either
    if (e.key === 'Tab') return; // to the show's bar and back
    e.preventDefault();
    e.stopPropagation();
    if (to === null) this.stop();
    else this.show(to);
  }

  private down(e: PointerEvent): void {
    if (this.at < 0 || (e.target as Element | null)?.closest?.('.thoughtknot-board-present-bar')) return;
    e.stopPropagation();
    this.press = { x: e.clientX };
  }

  /** A press goes on; a swipe goes on to the left and back to the right, as a page turns. */
  private lift(e: PointerEvent): void {
    const press = this.press;
    this.press = null;
    if (this.at < 0 || !press) return;
    e.stopPropagation();
    const across = e.clientX - press.x;
    this.show(this.at + (across > SWIPE ? -1 : 1));
  }
}
