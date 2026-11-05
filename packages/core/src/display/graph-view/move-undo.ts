// Undo and redo every edit made on the drawing (editor spec §68, move_undo; §72, edit_undo). Roger approved the undo of
// a move on 3 Nov 2026. On 5 Nov he asked that everything done in a view can be undone. A drag, a card moved to another
// column, a name typed, a thing added, linked or deleted: each is written to the note at once. So each offers its undo.
// A small toast says what was done, with an Undo button, for a few seconds.
// - Ctrl+Z (Cmd+Z on a Mac) on the drawing takes back the last edit, then the one before. It goes on working long
//   after the toast has gone. Ctrl+Shift+Z, or Ctrl+Y, does an undone edit again.
// - Writing the note draws the card again. So the history is kept here, by graph, not in the card. The card drawn
//   again offers it too.
// - An undo that can no longer be written, as the note changed since, says why in the toast, and is let go.

import { word } from '../../words.ts';

/** How long, in milliseconds, the toast offers the last edit's undo. Ctrl+Z goes on working after it. */
export const UNDO_MS = 8000;
/** The most edits kept to undo, in each graph. */
export const UNDO_MOST = 50;

/** What a step written back gives: why it could not be, or nothing when it was. */
type Step = () => unknown;

/** An edit that can be taken back: what it said, and how to undo and redo it. */
interface Done {
  said: string;
  undo: Step;
  redo?: Step;
}

/** The edits of one graph that can be undone, last last; those undone that can be done again; the toast's offer. */
interface History {
  done: Done[];
  undone: Done[];
  /** The edit the toast offers, and until when; none once it has gone. */
  shown: { said: string; until: number } | null;
}

const histories = new Map<string, History>();
const historyOf = (graph: string): History => {
  let h = histories.get(graph);
  if (!h) histories.set(graph, (h = { done: [], undone: [], shown: null }));
  return h;
};

/** Why a step written back wrote nothing: the words it gave, else none. */
const refusal = (r: unknown): string | null => (typeof r === 'string' && r ? r : null);

/** The undo history of one card's graph, and the toast that offers it. */
export class MoveUndo {
  private readonly viewport: HTMLElement;
  private readonly graph: string;
  /** The toast, its words and its Redo button, made the first time an edit is offered. */
  private toast: { el: HTMLElement; said: HTMLElement; redo: HTMLElement } | null = null;
  private timer: number | null = null;

  /** For the drawing of `graph` in `viewport`. An edit just made in it, before it was drawn again, is offered still. */
  constructor(viewport: HTMLElement, graph: string) {
    this.viewport = viewport;
    this.graph = graph;
    const shown = histories.get(graph)?.shown;
    const left = shown ? shown.until - Date.now() : 0;
    if (shown && left > 0) this.show(shown.said, left);
  }

  /** Offers `undo` for the edit just written, which `said` names, and `redo` to write it again. It clears the redos. */
  offer(said: string, undo: Step, redo?: Step): void {
    const h = historyOf(this.graph);
    h.done.push({ said, undo, ...(redo ? { redo } : {}) });
    if (h.done.length > UNDO_MOST) h.done.shift();
    h.undone = [];
    this.show(said, UNDO_MS);
  }

  /** Takes the last edit back, if this graph has one. Says whether there was one. */
  undo(): boolean {
    const h = histories.get(this.graph);
    const last = h?.done.pop();
    if (!h || !last) return false;
    this.forget();
    void Promise.resolve(last.undo()).then((r) => {
      const why = refusal(r);
      if (why) return void this.show(why, UNDO_MS);
      if (!last.redo) return;
      h.undone.push(last);
      this.show(word('move.undone-what', { said: last.said }), UNDO_MS);
    });
    return true;
  }

  /** Does the last edit undone again, if there is one. Says whether there was one. */
  redo(): boolean {
    const h = histories.get(this.graph);
    const next = h?.undone.pop();
    if (!h || !next?.redo) return false;
    void Promise.resolve(next.redo()).then((r) => {
      const why = refusal(r);
      if (why) return void this.show(why, UNDO_MS);
      h.done.push(next);
      this.show(next.said, UNDO_MS);
    });
    return true;
  }

  /** Ctrl+Z or Cmd+Z undoes; with Shift, or Ctrl+Y, it redoes. Says whether the key was used. */
  key(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    if (k === 'z') return e.shiftKey ? this.redo() : this.undo();
    return k === 'y' && !e.shiftKey && this.redo();
  }

  /** The toast hidden. The history is kept. */
  forget(): void {
    const h = histories.get(this.graph);
    if (h) h.shown = null;
    this.toast?.el.classList.add('is-hidden');
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** The card gone: its timer stopped, and the history kept for the card drawn in its place. */
  onunload(): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private show(said: string, ms: number): void {
    const h = historyOf(this.graph);
    h.shown = { said, until: Date.now() + ms };
    const t = (this.toast ??= this.made());
    t.said.textContent = said;
    t.redo.classList.toggle('is-hidden', !h.undone.some((d) => d.redo));
    t.el.classList.remove('is-hidden');
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      // another card's history may show in the same toast since: it is hidden only once the last offer's time is up
      const now = historyOf(this.graph).shown;
      if (!now || now.until <= Date.now() + 50) this.forget();
    }, ms);
  }

  /** The drawing's one toast: made here, or the one another undo of the same drawing made, so two never show. */
  private made(): { el: HTMLElement; said: HTMLElement; redo: HTMLElement } {
    const there = Array.from(this.viewport.children).find((c) => c.classList.contains('thoughtknot-undo-toast'));
    const said0 = there?.querySelector<HTMLElement>('.thoughtknot-undo-said'),
      redo0 = there?.querySelector<HTMLElement>('.thoughtknot-redo');
    if (there && said0 && redo0) return { el: there as HTMLElement, said: said0, redo: redo0 };
    const el = this.viewport.createDiv({ cls: 'thoughtknot-undo-toast is-hidden', attr: { role: 'status' } });
    const said = el.createSpan({ cls: 'thoughtknot-undo-said' });
    const b = el.createEl('button', { text: word('move.undo'), attr: { type: 'button' } });
    b.setAttribute('aria-label', word('move.undo-label'));
    b.addEventListener('click', () => this.undo());
    const redo = el.createEl('button', { cls: 'thoughtknot-redo is-hidden', text: word('move.redo') });
    redo.setAttribute('type', 'button');
    redo.setAttribute('aria-label', word('move.redo-label'));
    redo.addEventListener('click', () => this.redo());
    return { el, said, redo };
  }
}
