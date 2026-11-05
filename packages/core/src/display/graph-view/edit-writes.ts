// How an edit made in place is written, undone and asked about (editor spec §72, edit_undo, edit_delete_asks).
// - Each edit is written through the card's host, then offers its undo and its redo in the drawing's history
//   (move-undo.ts). So Ctrl+Z takes back a name typed, a thing added, linked or deleted, one at a time.
// - Delete asks first, in the editor beside the thing, never in a window over the view. Delete, Enter or the delete
//   key again says yes. Keep, or Escape, writes nothing.
import { word } from '@thoughtknot/core';
import type { Lifecycle } from '../lifecycle';
import { accept } from './estimate-actions';
import { MoveUndo } from './move-undo';
import type { ViewOptions } from './view-options';

/** What writing needs of its card: the card, for its listeners, and the drawing's viewport and options as they are now. */
export interface WritesHost {
  card: Lifecycle;
  viewport: () => HTMLElement;
  o: () => ViewOptions;
}

/** The writes of one card's editor, each offering its undo, and the question Delete asks. */
export class EditWrites {
  /** The undo history of the drawing, made for its viewport the first time it is asked for. */
  private history: { vp: HTMLElement; undo: MoveUndo } | null = null;
  /** Says yes to the Delete waiting for an answer, else none. */
  private asking: (() => void) | null = null;

  constructor(private readonly host: WritesHost) {}

  /** The undo history of the drawing. It shows the toast of an edit just made, in the card drawn again. */
  undoes(): MoveUndo {
    const vp = this.host.viewport();
    if (this.history?.vp !== vp) {
      const undo = new MoveUndo(vp, this.host.o().graph);
      this.host.card.register(() => undo.onunload());
      this.history = { vp, undo };
    }
    return this.history.undo;
  }

  /** Writes an edit, then offers its undo and redo as `said`. Resolves to why nothing was written, or null. */
  async written(said: string, block: number, was: string, now: string): Promise<string | null> {
    const o = this.host.o();
    const why = await accept(o, block, was, now);
    if (why) return why;
    this.undoes().offer(
      said,
      () => accept(o, block, now, was),
      () => accept(o, block, was, now),
    );
    return null;
  }

  /**
   * Asks in `el` whether to delete `thing` and its `links`. Its yes has the focus. `yes` runs once it is said, and
   * `keep` once Keep or Escape is. Asked again while it waits, the question is taken as answered yes.
   */
  ask(el: HTMLElement, thing: string, links: number, yes: () => void, keep: () => void): void {
    if (this.asking) return this.asking();
    const box = el.createDiv({ cls: 'thoughtknot-edit-ask', attr: { role: 'alertdialog' } });
    box.createSpan({
      text: links ? word('edit.delete-ask', { thing, count: links }) : word('edit.delete-alone', { thing }),
    });
    const close = (): void => {
      this.asking = null;
      box.remove();
    };
    const sure = (): void => (close(), yes());
    const no = (): void => (close(), keep());
    this.asking = sure;
    const del = box.createEl('button', { cls: 'mod-warning', text: word('edit.delete') });
    del.setAttribute('type', 'button');
    del.addEventListener('click', sure);
    const kept = box.createEl('button', { text: word('edit.keep') });
    kept.setAttribute('type', 'button');
    kept.addEventListener('click', no);
    box.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      no();
    });
    del.focus({ preventScroll: true });
  }

  /** The question gone with its editor. */
  forget(): void {
    this.asking = null;
  }
}
