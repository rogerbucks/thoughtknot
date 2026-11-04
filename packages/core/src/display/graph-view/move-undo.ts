// Undo a move (editor spec §68, move_undo). Roger approved this from the UX review, 3 Nov 2026. A drag, or a card moved
// to another column, is written to the note at once. So each move offers its undo. A small toast says what moved, with
// an Undo button, for a few seconds. Ctrl+Z (Cmd+Z on a Mac) on the drawing does the same while the toast shows.
// Writing the note draws the card again. So the offer is kept here, not in the card, and the new card shows it too.

import { word } from '../../words.ts';

/** How long, in milliseconds, a move can be taken back. */
export const UNDO_MS = 8000;

/** The move that can be taken back now: in which graph, what it said, how, and until when. One at a time. */
let pending: { graph: string; said: string; undo: () => unknown; until: number } | null = null;

/** The undo of the last move in one card's graph, and the toast that offers it. */
export class MoveUndo {
  private readonly viewport: HTMLElement;
  private readonly graph: string;
  /** The toast and its words, made the first time a move is offered. */
  private toast: { el: HTMLElement; said: HTMLElement } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The offer this toast shows: another card's later offer is never forgotten by this one. */
  private shown: typeof pending = null;

  /** For the drawing of `graph` in `viewport`. A move just made in it, before it was drawn again, is offered still. */
  constructor(viewport: HTMLElement, graph: string) {
    this.viewport = viewport;
    this.graph = graph;
    const left = pending && pending.graph === graph ? pending.until - Date.now() : 0;
    if (pending && left > 0) this.show(pending.said, left);
  }

  /** Offers `undo` for the move just written, which `said` names. A later move replaces it. */
  offer(said: string, undo: () => unknown): void {
    pending = { graph: this.graph, said, undo, until: Date.now() + UNDO_MS };
    this.show(said, UNDO_MS);
  }

  /** Takes the last move back, if one is offered for this graph. Says whether there was one. */
  undo(): boolean {
    const last = pending;
    if (!last || last.graph !== this.graph || last.until <= Date.now()) return false;
    this.shown = last;
    this.forget();
    void last.undo();
    return true;
  }

  /** Ctrl+Z or Cmd+Z, without Shift, takes the last move back. Says whether the key was used. */
  key(e: KeyboardEvent): boolean {
    const z = e.key === 'z' || e.key === 'Z';
    return z && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && this.undo();
  }

  /** The toast hidden, and nothing offered. */
  forget(): void {
    if (pending && pending === this.shown) pending = null;
    this.shown = null;
    this.toast?.el.classList.add('is-hidden');
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** The card gone: its timer stopped, and the offer kept for the card drawn in its place. */
  unload(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private show(said: string, ms: number): void {
    this.shown = pending;
    const t = (this.toast ??= this.made());
    t.said.textContent = said;
    t.el.classList.remove('is-hidden');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.forget(), ms);
  }

  private made(): { el: HTMLElement; said: HTMLElement } {
    const el = this.viewport.createDiv({ cls: 'thoughtknot-undo-toast is-hidden', attr: { role: 'status' } });
    const said = el.createSpan({ cls: 'thoughtknot-undo-said' });
    const b = el.createEl('button', { text: word('move.undo'), attr: { type: 'button' } });
    b.setAttribute('aria-label', word('move.undo-label'));
    b.addEventListener('click', () => this.undo());
    return { el, said };
  }
}
