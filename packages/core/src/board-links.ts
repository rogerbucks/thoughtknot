// A board item and the things it became, kept linked both ways (editor spec §45, board_graph_linked, board_link_kept).
// - An item that became one thing names it, in its `graph` property. The thing's details say it is on a board: which
//   board, and which item. Each opens the other.
// - A rename on either side follows to the other. A thing renamed changes every item that names it. An item's words
//   changed give the change that renames the thing, offered as a proposal like any change (§17).
// - Deleting a thing never deletes its item: the item is marked unlinked. Deleting an item never deletes its things.
// - Each edit gives the board's text as it was too, so an undo puts both sides back.
// An item that became several things, a list, names none: its things are linked by what they cite. Host-free and pure.
import { gqlBlocks } from './blocks.ts';
import { itemGql, readBoard, writeBoard } from './board.ts';
import type { BoardItem } from './board.ts';
import { valueGql } from './proposals.ts';
import type { ChangeInput } from './proposals.ts';
import { writtenIn } from './written-things.ts';

/** A board's text after an edit, with the text before it, which an undo puts back. */
export interface BoardEdit {
  text: string;
  undo: string;
}

/** Where a thing is on a board: the board, and the item that stands for the thing. */
export interface OnBoard {
  board: string;
  item: string;
}

/** The text of one item written again by `change`; the text as it was when the block does not hold the item. */
function rewritten(text: string, id: string, change: (item: BoardItem) => BoardItem): string {
  const item = readBoard(text).board.items.find((i) => i.id === id);
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === id);
  if (!item || !w) return text;
  return text.slice(0, w.open) + itemGql(change(item)) + text.slice(w.close + 1);
}

/** The text with each item of `things` (an item's id, and the one thing it became) naming its thing. */
export function linkItems(text: string, things: Readonly<Record<string, string>>): BoardEdit {
  let out = text;
  for (const [id, thing] of Object.entries(things)) out = rewritten(out, id, (i) => ({ ...i, graph: thing }));
  return { text: out, undo: text };
}

/** Each place the thing `thing` of `graph` is on a board in `note`: for its details, which say it is on one. */
export function thingBoards(note: string, graph: string, thing: string): OnBoard[] {
  return gqlBlocks(note).flatMap((b) => {
    const { board } = readBoard(b.text);
    return board.on === graph
      ? board.items.filter((i) => i.graph === thing).map((i) => ({ board: board.name, item: i.id }))
      : [];
  });
}

/** The thing an item stands for, for opening it from the item; undefined for an item that stands for none. */
export const thingOfItem = (text: string, id: string): string | undefined =>
  readBoard(text).board.items.find((i) => i.id === id)?.graph;

/** The text after the thing `from` was renamed `to`: each item that named it names the new one. */
export function thingRenamed(text: string, from: string, to: string): BoardEdit {
  const { items } = readBoard(text).board;
  let out = text;
  for (const item of items) if (item.graph === from) out = rewritten(out, item.id, (i) => ({ ...i, graph: to }));
  return { text: out, undo: text };
}

/** The change that renames the thing an item stands for, when its words were changed; none for an item with none. */
export function itemRetitled(text: string, id: string, words: string): ChangeInput | undefined {
  const thing = thingOfItem(text, id);
  return thing === undefined ? undefined : { op: 'set', thing, key: 'name', value: valueGql(words) };
}

/**
 * The text after the thing `thing` was deleted: each item that named it stays, marked unlinked, and names nothing.
 * Nothing on the board is deleted.
 */
export function thingDeleted(text: string, thing: string): BoardEdit {
  const { items } = readBoard(text).board;
  let out = text;
  for (const item of items)
    if (item.graph === thing)
      out = rewritten(out, item.id, ({ graph: _gone, ...i }) => ({ ...i, more: { ...i.more, unlinked: true } }));
  return { text: out, undo: text };
}

/**
 * The text after one item was deleted, and its connectors with it, the block written in its one fixed form. The things
 * it became are the graph's, and never touched.
 */
export function itemDeleted(text: string, id: string): BoardEdit {
  const { board } = readBoard(text);
  if (!board.items.some((i) => i.id === id)) return { text, undo: text };
  const kept = {
    ...board,
    items: board.items.filter((i) => i.id !== id),
    connectors: board.connectors.filter((c) => c.from !== id && c.to !== id),
  };
  return { text: writeBoard(kept), undo: text };
}
