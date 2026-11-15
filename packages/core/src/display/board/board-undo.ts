// Undo on a board by its usual key (editor spec §45, board_keyboard): Ctrl or Cmd with Z takes back the last change
// this person made on the board. Each change is logged as it is written (board-history.ts), by the host's key. So the
// log lives on when the host draws the board afresh. Where something changed since, nothing is undone and that is
// said. With Shift as well, or Ctrl with Y, the change last undone is made again. A new change ends what can be
// made again. Kept apart so board-view.ts stays small.
import { word } from '@thoughtknot/core';

import type { BoardChange } from '../../board-edit.ts';
import { markUndone, record, undoPlan, type History } from '../../board-history.ts';

/** The person at this board, as the log names them. */
const ME = 'me';
/** The most changes a board keeps to undo. */
const MOST = 100;

/** The log of one board: its changes, its undos to make again, its text as last seen, and an undo under way. */
interface Log {
  history: History;
  undos: History;
  text: string;
  undoing: boolean;
  refused: boolean;
}
const logs = new Map<string, Log>();

type Write = (change: BoardChange) => Promise<{ text: string } | { refused: string }>;

/** The host with each change it writes logged, so it can be undone. `source` is the board's block as drawn now. */
export function recorded<H extends { key: string; write?: Write }>(host: H, source: string): H {
  const { write } = host;
  if (!write) return host;
  const log = logs.get(host.key) ?? { history: [], undos: [], text: source, undoing: false, refused: false };
  logs.set(host.key, log);
  log.text = source;
  return {
    ...host,
    write: async (change: BoardChange) => {
      const before = log.text; // read first: the host may draw the board afresh before the write is done
      const r = await write(change);
      if ('refused' in r) log.refused = true;
      else {
        if (!log.undoing) {
          log.history = record(log.history, before, r.text, ME, Date.now()).slice(-MOST);
          log.undos = [];
        }
        log.text = r.text;
      }
      return r;
    },
  };
}

/** What the key needs of its board: the board's own write, which draws what was written, and its words. */
export interface UndoHooks {
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
}

/** Which step a key asks for: Z with Ctrl or Cmd undoes; with Shift as well, or Ctrl with Y, it redoes. */
function stepOf(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  return k === 'y' && e.ctrlKey && !e.shiftKey ? 'redo' : null;
}

/** Whether the key was undo or redo, done or refused in words. False on a board that cannot be changed. */
export function undoKey(e: KeyboardEvent, key: string, h: UndoHooks): boolean {
  const step = stepOf(e);
  const log = logs.get(key);
  if (!step || !log) return false;
  e.preventDefault();
  if (log.undoing) return true;
  const redo = step === 'redo';
  // a redo takes back the undo, by the same plan
  const from = redo ? log.undos : log.history;
  if (redo && !from.some((u) => !u.undone)) {
    h.say(word('board.redo.nothing'));
    return true;
  }
  const plan = undoPlan(from, log.text, ME);
  if ('refused' in plan) {
    h.say(plan.refused);
    return true;
  }
  const before = log.text;
  log.undoing = true;
  log.refused = false;
  void (async () => {
    try {
      for (const change of plan.changes) if (!log.refused) await h.write(change);
    } finally {
      log.undoing = false;
    }
    const at = Date.now();
    if (redo) {
      // the change made again can be undone again
      log.undos = markUndone(log.undos, plan.entry.n);
      log.history = record(log.history, before, log.text, ME, at).slice(-MOST);
    } else {
      log.history = markUndone(log.history, plan.entry.n);
      log.undos = record(log.undos, before, log.text, ME, at);
    }
    if (!log.refused) h.say(word(redo ? 'board.redone' : 'board.undone'));
  })();
  return true;
}
