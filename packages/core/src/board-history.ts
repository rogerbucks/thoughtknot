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
  // a link is as the author left it only if it is still there (made) or still gone (taken out), with its label
  const now2 = new Map(board.connectors.map((c) => [linkKey(c), c]));
  for (const l of entry.links) {
    const cur = now2.get(linkKey(l));
    if (l.added ? !cur || cur.label !== l.label : !!cur) clashes.push(`${l.from}-${l.to}`);
  }
  for (const l of entry.links) if (l.added) changes.push({ kind: 'disconnect', from: l.from, to: l.to });
  for (const op of [...entry.items].reverse()) {
    const cur = now.get(op.id) ?? null;
    if (!same(cur, op.after)) clashes.push(op.id);
    else if (!op.before) changes.push({ kind: 'remove', id: op.id });
    else if (!op.after) changes.push({ kind: 'add', item: op.before });
    else changes.push(...itemBack(op.after, op.before));
  }
  for (const l of entry.links)
    if (!l.added)
      changes.push(
        l.label === undefined
          ? { kind: 'connect', from: l.from, to: l.to }
          : { kind: 'connect', from: l.from, to: l.to, label: l.label },
      );
  if (clashes.length) return { refused: word('board.history.clash', { ids: clashes.join(', ') }) };
  return { entry, changes: movedAsOne(changes) };
}

/** An item without what an edit to the item alone can set: what is left tells whether more than that changed. */
function rest(item: BoardItem): string {
  const { w: _w, h: _h, text: _text, layer: _layer, locked: _locked, style: _style, group: _group, ...left } = item;
  return itemGql({ ...left, x: 0, y: 0 });
}

/**
 * The edits that put an item back as it `was`. Where only its place, size, text, layer, lock, style or group changed,
 * each is set back by itself, so the item's own text alone is written and the rest of the block stays as written.
 * Anything else, or a property that was not there before, puts the whole item back.
 */
function itemBack(now: BoardItem, was: BoardItem): BoardChange[] {
  const { id } = was;
  const whole: BoardChange[] = [{ kind: 'put', item: was }];
  if (rest(now) !== rest(was)) return whole;
  const out: BoardChange[] = [];
  if (now.x !== was.x || now.y !== was.y) out.push({ kind: 'move', id, x: was.x, y: was.y });
  if (now.w !== was.w || now.h !== was.h) {
    if (was.w === undefined || was.h === undefined) return whole;
    out.push({ kind: 'size', id, w: was.w, h: was.h });
  }
  if (now.text !== was.text) {
    if (was.text === undefined) return whole;
    out.push({ kind: 'text', id, text: was.text });
  }
  if (now.layer !== was.layer) {
    if (was.layer === undefined) return whole;
    out.push({ kind: 'layer', id, layer: was.layer });
  }
  if (now.style !== was.style) out.push({ kind: 'style', id, style: was.style ?? null });
  if (now.group !== was.group) out.push({ kind: 'group', id, group: was.group ?? null });
  if (now.locked !== was.locked) {
    if (was.locked === false || now.locked === false) return whole;
    out.unshift({ kind: 'lock', id, locked: !!was.locked }); // first: a locked item may not be moved back
  }
  return out;
}

/** Several items moved back are one edit, as the arrangement that moved them was. */
function movedAsOne(changes: BoardChange[]): BoardChange[] {
  const moves = changes.filter((c) => c.kind === 'move');
  if (moves.length < 2) return changes;
  const at = changes.indexOf(moves[0] as BoardChange);
  const others = changes.filter((c) => c.kind !== 'move');
  others.splice(at, 0, { kind: 'moves', moves: moves.map(({ id, x, y }) => ({ id, x, y })) });
  return others;
}

/** The block with a plan carried out, all or none: the first edit that is refused leaves the block as it was. */
export function carryOut(text: string, plan: { changes: BoardChange[] }): { text: string } | { refused: string } {
  let now = text;
  for (const change of plan.changes) {
    const r = boardEdit(now, change, true);
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
