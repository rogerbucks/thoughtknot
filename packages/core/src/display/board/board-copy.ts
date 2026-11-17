// Copy, paste and duplicate on a board by their usual keys (editor spec §45, board_handles): Ctrl or Cmd with C, V or
// D. What is copied is kept for the page, so it can be pasted on another board too. A paste lands in the middle of the
// view; a duplicate lands just beside what it copies. Each is said, and each is one change, so one undo takes it back.
import { word } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { copyItems, duplicateItems, pasteClip, type BoardClip } from '../../board-clip.ts';
import type { BoardChange } from '../../board-edit.ts';
import type { BoardSelection } from './board-select.ts';

/** What was copied last on any board of the page. */
let copied: BoardClip | null = null;

/** What the keys need of their board. */
export interface CopyHooks {
  board: () => Board;
  /** The items chosen: the keys work on them, else on the item in focus. */
  sel: BoardSelection;
  focus: () => string | null;
  /** The middle of the view, in board units. */
  centre: () => [number, number];
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
  /** Puts the keyboard on an item. */
  choose: (id: string) => void;
  readOnly: boolean;
}

/** The items the keys work on: those chosen, else the one in focus. */
function itemsOf(h: CopyHooks): string[] {
  const chosen = h.sel.list();
  const focus = h.focus();
  return chosen.length ? chosen : focus ? [focus] : [];
}

/** The items just made, chosen, the keyboard on the first. `said` comes last, so the count is what stays said. */
function made(h: CopyHooks, ids: string[], said: string): void {
  h.sel.set(ids);
  if (ids[0]) h.choose(ids[0]);
  h.say(said);
}

/** Whether the key was a copy, paste or duplicate, done. */
export function copyKey(e: KeyboardEvent, h: CopyHooks): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const key = e.key.toLowerCase();
  if (key === 'c') {
    const clip = copyItems(h.board(), itemsOf(h));
    if (!clip) return false;
    copied = clip;
    h.say(word('board.copied', { count: clip.items.length }));
  } else if (key === 'v' && copied && !h.readOnly) {
    const { change, ids } = pasteClip(h.board(), copied, h.centre());
    void h.write(change).then(() => made(h, ids, word('board.pasted', { count: ids.length })));
  } else if (key === 'd' && !h.readOnly) {
    const r = duplicateItems(h.board(), itemsOf(h));
    if (!r) return false;
    void h.write(r.change).then(() => made(h, r.ids, word('board.duplicated', { count: r.ids.length })));
  } else return false;
  e.preventDefault();
  return true;
}
