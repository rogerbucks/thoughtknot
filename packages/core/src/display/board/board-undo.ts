// Undo on a board by its usual key (editor spec §45, board_keyboard): Ctrl or Cmd with Z takes back the last change
// this person made on the board. The changes are logged as they are written (board-history.ts), by the host's key, so
// the log lives on when the host draws the board afresh. Where something changed since, nothing is undone and that is
// said. Kept apart so board-view.ts stays small.
import { word } from '@thoughtknot/core';

import type { BoardChange } from '../../board-edit.ts';
import { markUndone, record, undoPlan, type History } from '../../board-history.ts';

/** The person at this board, as the log names them. */
const ME = 'me';
/** The most changes a board keeps to undo. */
const MOST = 100;

/** The log of one board: its changes, its text as last seen, and what an undo under way has met. */
interface Log {
  history: History;
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
  const log = logs.get(host.key) ?? { history: [], text: source, undoing: false, refused: false };
  logs.set(host.key, log);
  log.text = source;
  return {
    ...host,
    write: async (change: BoardChange) => {
      const before = log.text; // read first: the host may draw the board afresh before the write is done
      const r = await write(change);
      if ('refused' in r) log.refused = true;
      else {
        if (!log.undoing) log.history = record(log.history, before, r.text, ME, Date.now()).slice(-MOST);
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

/** Whether the key was undo, done or refused in words. False on a board that cannot be changed. */
export function undoKey(e: KeyboardEvent, key: string, h: UndoHooks): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'z') return false;
  const log = logs.get(key);
  if (!log) return false;
  e.preventDefault();
  if (log.undoing) return true;
  const plan = undoPlan(log.history, log.text, ME);
  if ('refused' in plan) {
    h.say(plan.refused);
    return true;
  }
  log.undoing = true;
  log.refused = false;
  void (async () => {
    try {
      for (const change of plan.changes) if (!log.refused) await h.write(change);
    } finally {
      log.undoing = false;
    }
    log.history = markUndone(log.history, plan.entry.n);
    if (!log.refused) h.say(word('board.undone'));
  })();
  return true;
}
