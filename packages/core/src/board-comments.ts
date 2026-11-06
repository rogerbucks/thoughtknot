// Comments on a board's items (editor spec §45, board_comments). Anyone may comment on any item, in threads. A thread is
// a list of notes, each with its writer, and is open until someone resolves it. The threads are kept in the board block,
// on the item, as a property `comments` holding them as JSON, so they travel with the board. Pure and host-free.
import type { BoardItem } from './board.ts';

/** One note in a thread: who wrote it and what it says. */
export interface CommentNote {
  by: string;
  text: string;
}

/** A thread of comments on an item: its name on the item, the notes in order, and whether it is resolved. */
export interface Thread {
  id: string;
  notes: CommentNote[];
  resolved: boolean;
}

/** What is done to the threads of an item. */
export type CommentOp =
  | { op: 'start'; person: string; text: string }
  | { op: 'reply'; thread: string; person: string; text: string }
  | { op: 'resolve'; thread: string }
  | { op: 'reopen'; thread: string };

/** The threads written on an item. Whatever cannot be read as a thread is left out. */
export function threadsOf(item: BoardItem): Thread[] {
  const raw = item.more.comments;
  if (typeof raw !== 'string') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Thread[] = [];
  for (const t of parsed as Record<string, unknown>[]) {
    if (!t || typeof t.id !== 'string' || !Array.isArray(t.notes)) continue;
    const notes = (t.notes as Record<string, unknown>[]).flatMap((n) =>
      n && typeof n.by === 'string' && typeof n.text === 'string' ? [{ by: n.by, text: n.text }] : [],
    );
    out.push({ id: t.id, notes, resolved: t.resolved === true });
  }
  return out;
}

/** How many threads on an item are still open. */
export const openThreads = (item: BoardItem): number => threadsOf(item).filter((t) => !t.resolved).length;

/** The item's `more` with `change` made to its threads, or null when the thread it names is not there. */
export function commentedMore(item: BoardItem, change: CommentOp): BoardItem['more'] | null {
  const threads = threadsOf(item);
  let next: Thread[];
  if (change.op === 'start') {
    let n = threads.length + 1;
    while (threads.some((t) => t.id === `t${n}`)) n++;
    next = [...threads, { id: `t${n}`, notes: [{ by: change.person, text: change.text }], resolved: false }];
  } else {
    if (!threads.some((t) => t.id === change.thread)) return null;
    next = threads.map((t) => {
      if (t.id !== change.thread) return t;
      if (change.op === 'reply') return { ...t, notes: [...t.notes, { by: change.person, text: change.text }] };
      return { ...t, resolved: change.op === 'resolve' };
    });
  }
  const more = { ...item.more };
  if (next.length) more.comments = JSON.stringify(next.map((t) => (t.resolved ? t : { id: t.id, notes: t.notes })));
  else delete more.comments;
  return more;
}

/** An item's comments in words: how many threads are open and how many are resolved; empty when it has none. */
export function commentsSaid(item: BoardItem, say: (open: number, done: number) => string): string {
  const threads = threadsOf(item);
  return threads.length ? say(openThreads(item), threads.length - openThreads(item)) : '';
}
