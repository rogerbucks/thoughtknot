// Who changed a board, and undo of one's own changes (editor spec §45, board_authorship). Every change to a board is
// logged with its author, and what each item and link was before and after. Undo takes back only the changes of the
// person who asks, and only while nobody has changed the same things since. Where someone has, nothing is undone and the
// clash is said, so another person's work is never overwritten. Pure and host-free: the log is a list the host keeps.
import { readBoard, itemGql } from './board.ts';
import type { Board, BoardItem } from './board.ts';
import { boardEdit } from './board-edit.ts';
import type { BoardChange } from './board-edit.ts';
import { word } from './words.ts';

/** What happened to one item: how it was, and how it is. Null before is an item made; null after is one taken out. */
export interface ItemOp {
  id: string;
  before: BoardItem | null;
  after: BoardItem | null;
}

/** What happened to one connector: made when `added`, else taken out. */
export interface LinkOp {
  from: string;
  to: string;
  label?: string;
  added: boolean;
}

/** One logged change: its number, its author, the time, and what it did. */
export interface Entry {
  n: number;
  by: string;
  at: number;
  items: ItemOp[];
  links: LinkOp[];
  undone?: boolean;
}

/** The log of a board, oldest first. */
export type History = readonly Entry[];

const same = (a: BoardItem | null | undefined, b: BoardItem | null | undefined): boolean =>
  !a || !b ? !a && !b : itemGql(a) === itemGql(b);
const linkKey = (c: { from: string; to: string }) => `${c.from}\u0000${c.to}`;

/** What differs between two boards: the items and links made, changed or taken out. */
export function diffBoards(before: Board, after: Board): { items: ItemOp[]; links: LinkOp[] } {
  const was = new Map(before.items.map((i) => [i.id, i]));
  const now = new Map(after.items.map((i) => [i.id, i]));
  const items: ItemOp[] = [];
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const b = was.get(id) ?? null;
    const a = now.get(id) ?? null;
    if (!same(a, b)) items.push({ id, before: b, after: a });
  }
  const links: LinkOp[] = [];
  const old = new Map(before.connectors.map((c) => [linkKey(c), c]));
  const cur = new Map(after.connectors.map((c) => [linkKey(c), c]));
  for (const [k, c] of cur) if (!old.has(k)) links.push({ ...c, added: true });
  for (const [k, c] of old) if (!cur.has(k)) links.push({ ...c, added: false });
  return { items, links };
}

/** The log with the change from `before` to `after` (two block texts) added under `by`; unchanged when nothing changed. */
export function record(history: History, before: string, after: string, by: string, at: number): History {
  const { items, links } = diffBoards(readBoard(before).board, readBoard(after).board);
  if (!items.length && !links.length) return history;
  return [...history, { n: (history[history.length - 1]?.n ?? 0) + 1, by, at, items, links }];
}

/** The log with entry `n` marked as undone. */
export const markUndone = (history: History, n: number): History =>
  history.map((e) => (e.n === n ? { ...e, undone: true } : e));

/** What undo will do for a person: the entry it takes back and the edits that take it back. Or why it cannot. */
export type UndoPlan = { entry: Entry; changes: BoardChange[] } | { refused: string };

/** The plan to undo the latest change of `person` that is not undone, on the board as it is now in `text`. */
export function undoPlan(history: History, text: string, person: string): UndoPlan {
  const entry = [...history].reverse().find((e) => e.by === person && !e.undone);
  if (!entry) return { refused: word('board.history.nothing') };
  const board = readBoard(text).board;
  const now = new Map(board.items.map((i) => [i.id, i]));
  const clashes: string[] = [];
  const changes: BoardChange[] = [];
  for (const l of entry.links) if (l.added) changes.push({ kind: 'disconnect', from: l.from, to: l.to });
  for (const op of [...entry.items].reverse()) {
    const cur = now.get(op.id) ?? null;
    if (!same(cur, op.after)) clashes.push(op.id);
    else if (!op.before) changes.push({ kind: 'remove', id: op.id });
    else if (!op.after) changes.push({ kind: 'add', item: op.before });
    else changes.push({ kind: 'put', item: op.before });
  }
  for (const l of entry.links)
    if (!l.added)
      changes.push(
        l.label === undefined
          ? { kind: 'connect', from: l.from, to: l.to }
          : { kind: 'connect', from: l.from, to: l.to, label: l.label },
      );
  if (clashes.length) return { refused: word('board.history.clash', { ids: clashes.join(', ') }) };
  return { entry, changes };
}

/** The block with a plan carried out, all or none: the first edit that is refused leaves the block as it was. */
export function carryOut(text: string, plan: { changes: BoardChange[] }): { text: string } | { refused: string } {
  let now = text;
  for (const change of plan.changes) {
    const r = boardEdit(now, change);
    if ('refused' in r) return r;
    now = r.text;
  }
  return { text: now };
}

/** The log as lines of words, oldest first, each naming its author. */
export function logLines(history: History): string[] {
  return history.map((e) =>
    word('board.history.line', {
      n: e.n,
      by: e.by,
      what: word('board.history.changed', { items: e.items.length, links: e.links.length }),
    }),
  );
}
