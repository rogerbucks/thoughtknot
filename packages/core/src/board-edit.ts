// Editing a board by its text (editor spec §45, board_is_text and board_keyboard). Each edit is a change to the board
// block. A move, a new size or new text changes that item's own text alone. The rest of the block stays as written.
// An item made, taken out or joined writes the board again in its one fixed form. That is refused while the block holds a
// problem, so nothing the reader could not read is ever lost. A locked item is never moved, sized or taken out.
//
// Nothing else on the board moves when one item does (nodes stay put). A new item goes in a free place beside the
// one in focus, never on top of another.
import { gqlSpans } from './blocks.ts';
import { boardOf, itemGql, readBoard, writeBoard } from './board.ts';
import type { Board, BoardItem, BoardKind } from './board.ts';
import { itemBox } from './board-svg.ts';
import { replaceSpan } from './store.ts';
import { writtenIn } from './written-things.ts';
import { votedMore } from './board-vote.ts';
import { word } from './words.ts';

/** One edit to a board. */
export type BoardChange =
  | { kind: 'move'; id: string; x: number; y: number }
  | { kind: 'size'; id: string; w: number; h: number }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'layer'; id: string; layer: number }
  | { kind: 'lock'; id: string; locked: boolean }
  | { kind: 'style'; id: string; style: string | null }
  | { kind: 'group'; id: string; group: string | null }
  | { kind: 'vote'; id: string; person: string; reaction: string | null }
  | { kind: 'add'; item: BoardItem }
  | { kind: 'remove'; id: string }
  | { kind: 'connect'; from: string; to: string; label?: string };

/** The smallest an item's side may be made, so it can still be seen and pointed at. */
export const MIN_SIDE = 20;
/** The room left between an item and a new one made beside it. */
export const GAP = 40;

/** The block with `change` made, or why it was refused, in words. */
export function boardEdit(text: string, change: BoardChange): { text: string } | { refused: string } {
  const { board, problems } = readBoard(text);
  const find = (id: string) => board.items.find((i) => i.id === id);
  if (isItemSet(change)) {
    const set = change;
    const item = find(set.id);
    if (!item) return { refused: word('board.edit.gone', { id: set.id }) };
    // text, votes and the lock itself may change on a locked item; nothing else may
    if (item.locked && !['text', 'lock', 'vote'].includes(set.kind)) return { refused: word('board.edit.locked') };
    return { text: itemChanged(text, item, patchOf(set, item)) };
  }
  // a change to the board's shape writes it again whole: never over what the reader could not read
  if (problems.some((p) => p.severity === 'error')) return { refused: word('board.edit.problems') };
  if (change.kind === 'add') {
    if (find(change.item.id)) return { refused: word('board.edit.taken', { id: change.item.id }) };
    board.items.push(change.item);
  } else if (change.kind === 'remove') {
    const item = find(change.id);
    if (!item) return { refused: word('board.edit.gone', { id: change.id }) };
    if (item.locked) return { refused: word('board.edit.locked') };
    board.items = board.items.filter((i) => i !== item);
    board.connectors = board.connectors.filter((c) => c.from !== item.id && c.to !== item.id);
  } else {
    const { from, to } = change;
    if (!find(from) || !find(to)) return { refused: word('board.edit.gone', { id: find(from) ? to : from }) };
    if (from === to) return { refused: word('board.edit.self') };
    if (board.connectors.some((c) => c.from === from && c.to === to)) return { refused: word('board.edit.joined') };
    board.connectors.push(change.label === undefined ? { from, to } : { from, to, label: change.label });
  }
  return { text: writeBoard(board) };
}

/**
 * The note with `change` made to its board named `name`, and the board block as now written. Refused when the note no
 * longer holds that board, or the edit is refused. Every byte outside the block is kept.
 */
export function boardEditInNote(
  note: string,
  name: string,
  change: BoardChange,
): { note: string; text: string } | { refused: string } {
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === name);
  if (!span) return { refused: word('board.edit.board-gone', { name }) };
  const r = boardEdit(span.text, change);
  if ('refused' in r) return r;
  return { note: replaceSpan(note, span, r.text).note, text: r.text };
}

// the changes that set properties of one item, which change that item's own text alone
type ItemSet = Extract<BoardChange, { kind: 'move' | 'size' | 'text' | 'layer' | 'lock' | 'style' | 'group' | 'vote' }>;
const SETS = new Set<string>(['move', 'size', 'text', 'layer', 'lock', 'style', 'group', 'vote']);
const isItemSet = (change: BoardChange): change is ItemSet => SETS.has(change.kind);

/**
 * What an item change sets on its item: places, sizes and layers as whole numbers, a size never too small. A style or a
 * group of null takes it off. A vote is given, or taken back when given before. Unlocking takes the lock off rather
 * than writing `locked: false`.
 */
function patchOf(change: ItemSet, item: BoardItem): Partial<BoardItem> {
  switch (change.kind) {
    case 'move':
      return { x: Math.round(change.x), y: Math.round(change.y) };
    case 'size':
      return { w: Math.max(MIN_SIDE, Math.round(change.w)), h: Math.max(MIN_SIDE, Math.round(change.h)) };
    case 'text':
      return { text: change.text };
    case 'layer':
      return { layer: Math.round(change.layer) };
    case 'lock':
      return { locked: change.locked ? true : undefined };
    case 'style':
      return { style: change.style ?? undefined };
    case 'group':
      return { group: change.group ?? undefined };
    case 'vote':
      return { more: votedMore(item, change.person, change.reaction) };
  }
}

/** The block with one item's own text written again with `patch`; everything else stays as it was. */
function itemChanged(text: string, item: BoardItem, patch: Partial<BoardItem>): string {
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === item.id);
  if (!w) return text;
  return text.slice(0, w.open) + itemGql({ ...item, ...patch }) + text.slice(w.close + 1);
}

/** A name for a new item of `kind` that the board does not use yet: sticky1, sticky2 and so on. */
export function freeId(board: Board, kind: BoardKind): string {
  const used = new Set(board.items.map((i) => i.id));
  const stem = kind.toLowerCase();
  let n = 1;
  while (used.has(`${stem}${n}`)) n++;
  return `${stem}${n}`;
}

/**
 * A new item of `kind`, placed in free room: just right of `near` when given, else centred on `centre`. Where that
 * room is taken it goes down a step at a time until it is free. No item already on the board is moved.
 */
export function newItem(board: Board, kind: BoardKind, near: BoardItem | null, centre: [number, number]): BoardItem {
  const item: BoardItem = { id: freeId(board, kind), kind, x: 0, y: 0, more: {} };
  const size = itemBox(item);
  const from = near ? itemBox(near) : null;
  item.x = Math.round(from ? from.x + from.w + GAP : centre[0] - size.w / 2);
  item.y = Math.round(from ? from.y : centre[1] - size.h / 2);
  const boxes = board.items.map(itemBox);
  const taken = () => {
    const b = itemBox(item);
    return boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  };
  for (let tries = 0; tries < 200 && taken(); tries++) item.y += size.h / 2;
  item.y = Math.round(item.y);
  return item;
}

/** The layer that puts an item over every other (`front`) or under every other, as a whole number. */
export function layerFor(board: Board, id: string, where: 'front' | 'back'): number {
  const others = board.items.filter((i) => i.id !== id).map((i) => i.layer ?? 0);
  if (!others.length) return 0;
  return where === 'front' ? Math.max(...others) + 1 : Math.min(...others) - 1;
}
