// What a double click and a drop do where things are drawn (editor spec §72, edit_gestures). Roger, 5 Nov 2026 (Q-19):
// one way of editing in every view.
// - A double click on a thing opens its name for typing, in the editor beside it.
// - A double click on empty space adds a thing, of the kind of the one selected. Its name opens in the card drawn next.
// - A box dropped right on another box links the first to the second (box-movers.ts).
// Each is one edit, which one undo takes back (edit_undo). Nothing is offered where the card cannot write.
import { details, word } from '@thoughtknot/core';
import { addedInColumn, linkedTo } from '../../thing-edits.ts';
import type { ViewOptions } from './view-options';
import type { Linker } from './box-links.ts';
import type { Lifecycle } from '../lifecycle';
import type { Target } from './taps';
import { moveHint } from './box-move-keys';

/** What the gestures need of the editor they belong to. */
export interface GestureHost {
  o: () => ViewOptions;
  /** The thing shown in the editor, else none. */
  key: () => string | null;
  writable: () => boolean;
  /** Opens the name of the thing shown for typing; whether there was one. */
  rename: () => boolean;
  /** Writes an edit, offering its undo as `said`; resolves to why nothing was written. */
  written: (said: string, block: number, was: string, now: string) => Promise<string | null>;
  /** Hands thing `key` on to be selected in the card drawn next, its name open if `rename`. */
  hand: (key: string, rename: boolean) => void;
  /** Forgets what was handed on, when the write failed. */
  unhand: () => void;
}

/** The gestures of one editor's drawing. */
export class Gestures {
  constructor(private readonly host: GestureHost) {}

  /** Whether a thing can be edited here now. */
  canWrite(): boolean {
    return this.host.writable();
  }

  /** A double click on thing `key`, the one shown: its name opens for typing. Whether it did. */
  renameOn(key: string): boolean {
    return this.host.writable() && this.host.key() === key && this.host.rename();
  }

  /** A double click on empty space: a new thing, not linked, its name open next. Whether it was taken; why not in `say`. */
  addHere(say: (why: string) => void): boolean {
    if (!this.host.writable()) return false;
    const o = this.host.o(),
      peer = this.host.key();
    const r = addedInColumn(o.reading, o.graph, { by: '', value: null, ...(peer && { peer }) }, word('edit.new-thing'));
    if ('reason' in r) return (say(r.reason), true);
    this.host.hand(r.name, true);
    void this.host.written(word('edit.added', { thing: r.name }), r.block, r.was, r.now).then((why) => {
      if (!why) return;
      this.host.unhand();
      say(why);
    });
    return true;
  }

  /** A box dropped on another's: a link from the first to the second. Why nothing was written goes to `say`. */
  linkDrop(from: string, to: string, say: (why: string) => void): void {
    const o = this.host.o();
    const r = linkedTo(o.reading, o.graph, from, to);
    if ('reason' in r) return say(r.reason);
    const thing = details(o.reading, o.graph, to)?.text ?? to;
    void this.host.written(word('edit.linked', { thing }), r.block, r.was, r.now).then((why) => why && say(why));
  }
}

/** What the drawing's gestures ask of the editor (edit_gestures): a name opened, a thing added, a link written. */
export type EditGestures = Linker & {
  renameOn: (key: string) => boolean;
  addHere: (say: (why: string) => void) => boolean;
};

/**
 * How long a second click's recentre waits for the double click that may follow it, in milliseconds. A browser sends
 * the double click straight after that click, so this is only long enough to see it, and too short to feel.
 */
const DOUBLE_CLICK_WAIT_MS = 40;

/** A mouse's second click and the double click that may follow it, on one card's drawing (edit_gestures). */
export class DoubleClicks {
  private timer: number | null = null;

  constructor(
    card: Lifecycle,
    private readonly viewport: HTMLElement,
    private readonly edits: EditGestures | undefined,
  ) {
    card.register(() => this.onunload());
  }

  /** A second click on the thing selected: `centre` runs once no double click came, at once for a finger. */
  second(touch: boolean, centre: () => void): void {
    this.onunload();
    if (touch || !this.edits?.canWrite()) return centre();
    this.timer = window.setTimeout(() => ((this.timer = null), centre()), DOUBLE_CLICK_WAIT_MS);
  }

  /**
   * A double click, which lets the second click's recentre go. On thing `at` it opens its name for typing. On empty
   * space (`empty`) it adds a thing, its name open. Whether it was taken.
   */
  edited(at: Target | null, empty: boolean): boolean {
    this.onunload();
    const edits = this.edits;
    if (!edits) return false;
    const say = (why: string) => {
      const line = moveHint(this.viewport);
      line.hidden = false;
      line.textContent = why;
    };
    return !!(at && 'key' in at && edits.renameOn(at.key)) || (empty && edits.addHere(say));
  }

  /** The recentre waiting let go. */
  onunload(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
