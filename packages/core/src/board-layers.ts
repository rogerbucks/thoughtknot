// The named layers of a board (editor spec §45, board_layers). A layer is a thing of the kind Layer in the board
// block, `(notes:Layer {name: 'Notes', order: 1})`, and an item is in it by its `in_layer` property. So the note's
// text stays the only store, and a layer holds no place of its own: any view can show it (rendering rule R16).
//
// A layer is shown or hidden, locked or open, and drawn over the layers of a lower order. Items in no layer are
// loose: they sit at order 0, between the layers above and the layers below. Hiding a layer moves nothing and takes
// nothing out of the note. Taking a layer out leaves its items on the board, loose.
import { itemGql, layerGql, writeBoard } from './board.ts';
import type { Board, BoardItem, BoardLayer } from './board.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

/** The property of an item that names its layer, by the layer's id. */
export const IN_LAYER = 'in_layer';

/** One edit to a board's layers. */
export type LayerChange =
  | { kind: 'layer-add'; name: string }
  | { kind: 'layer-set'; id: string; name?: string; hidden?: boolean; locked?: boolean; over?: boolean }
  /** One step up (1) or down (-1) among the layers and the loose items. */
  | { kind: 'layer-step'; id: string; by: 1 | -1 }
  | { kind: 'layer-remove'; id: string }
  /** Puts items into a layer, or makes them loose with null. */
  | { kind: 'into'; ids: string[]; layer: string | null };

const KINDS = new Set(['layer-add', 'layer-set', 'layer-step', 'layer-remove', 'into']);

/** Whether a change is one to the layers. */
export const isLayerChange = (change: { kind: string }): change is LayerChange => KINDS.has(change.kind);

/** The layer an item is in, or undefined for a loose item or a layer that is gone. */
export function layerOf(board: Board, item: BoardItem): BoardLayer | undefined {
  const id = item.more[IN_LAYER];
  return typeof id === 'string' ? board.layers?.find((l) => l.id === id) : undefined;
}

/**
 * Whether an item may not be moved, sized or taken out: it is locked, or its layer is locked or hidden. What a person
 * cannot see is never changed under them.
 */
export function lockedOn(board: Board, item: BoardItem): boolean {
  const layer = layerOf(board, item);
  return !!item.locked || !!layer?.locked || !!layer?.hidden;
}

/** Whether an item is drawn: its layer, if it has one, is not hidden. */
export const shownOn = (board: Board, item: BoardItem): boolean => !layerOf(board, item)?.hidden;

/** The order an item is drawn at by its layer: a loose item is at 0. */
export const orderOn = (board: Board, item: BoardItem): number => layerOf(board, item)?.order ?? 0;

/** The board as it is seen: without the items of hidden layers and the connectors to them. */
export function seenBoard(board: Board): Board {
  if (!board.layers?.some((l) => l.hidden)) return board;
  const items = board.items.filter((i) => shownOn(board, i));
  const have = new Set(items.map((i) => i.id));
  return {
    ...board,
    items,
    connectors: board.connectors.filter((c) => have.has(c.from) && have.has(c.to)),
  };
}

/** One row of the Layers list. */
export interface LayerRow {
  /** Null for the row of the loose items. */
  id: string | null;
  name: string;
  hidden: boolean;
  locked: boolean;
  /** Whether it is shown over the views of the board's graph too. */
  over: boolean;
  /** How many items it holds. */
  count: number;
}

/** The Layers list, top layer first, with the loose items as one row at their place among them. */
export function layerRows(board: Board): LayerRow[] {
  const count = new Map<string | null, number>();
  for (const item of board.items) {
    const id = layerOf(board, item)?.id ?? null;
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  const row = (l: BoardLayer): LayerRow => ({
    id: l.id,
    name: l.name,
    hidden: !!l.hidden,
    locked: !!l.locked,
    over: !!l.over,
    count: count.get(l.id) ?? 0,
  });
  const layers = stacked(board);
  const loose = {
    id: null,
    name: word('board.layers.loose'),
    hidden: false,
    locked: false,
    over: false,
    count: count.get(null) ?? 0,
  };
  return [...layers.filter((l) => l.order > 0).map(row), loose, ...layers.filter((l) => l.order <= 0).map(row)];
}

/** The layers from the top down; of two with one order, the later written is on top. */
function stacked(board: Board): BoardLayer[] {
  const layers = board.layers ?? [];
  return [...layers].sort((a, b) => b.order - a.order || layers.indexOf(b) - layers.indexOf(a));
}

/** A name for a new layer that the board does not use yet: layer1, layer2 and so on. */
function freeLayerId(board: Board): string {
  const used = new Set([...board.items.map((i) => i.id), ...(board.layers ?? []).map((l) => l.id)]);
  let n = 1;
  while (used.has(`layer${n}`)) n++;
  return `layer${n}`;
}

/** The block with the thing `id` written again as `gql`; everything else stays as it was. */
function rewritten(text: string, id: string, gql: string): string {
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === id);
  return w ? text.slice(0, w.open) + gql + text.slice(w.close + 1) : text;
}

/** An item with its layer set, or taken off with null. */
function inLayer(item: BoardItem, layer: string | null): BoardItem {
  const more = { ...item.more };
  delete more[IN_LAYER];
  return { ...item, more: layer === null ? more : { ...more, [IN_LAYER]: layer } };
}

/**
 * The block with a layer change made, or why it was refused. `board` is the block as read. `broken` says the block
 * holds a problem. Then nothing that writes the whole board again is done, so nothing is lost. Showing, hiding,
 * locking, naming and moving items between layers change only the lines they are about.
 */
export function layerEdit(
  text: string,
  board: Board,
  change: LayerChange,
  broken: boolean,
): { text: string } | { refused: string } {
  const layers = board.layers ?? [];
  const find = (id: string) => layers.find((l) => l.id === id);
  if (change.kind === 'into') {
    if (change.layer !== null && !find(change.layer))
      return { refused: word('board.layers.gone', { id: change.layer }) };
    const items = board.items.filter((i) => change.ids.includes(i.id) && !i.locked);
    if (!items.length) return { refused: word('board.edit.locked') };
    return { text: items.reduce((t, i) => rewritten(t, i.id, itemGql(inLayer(i, change.layer))), text) };
  }
  if (change.kind === 'layer-set') {
    const layer = find(change.id);
    if (!layer) return { refused: word('board.layers.gone', { id: change.id }) };
    const name = change.name?.trim() || layer.name;
    const next: BoardLayer = { id: layer.id, name, order: layer.order, more: layer.more };
    if (change.hidden ?? layer.hidden) next.hidden = true;
    if (change.locked ?? layer.locked) next.locked = true;
    if (change.over ?? layer.over) next.over = true;
    return { text: rewritten(text, layer.id, layerGql(next)) };
  }
  if (broken) return { refused: word('board.edit.problems') };
  if (change.kind === 'layer-add') {
    const order = Math.max(0, ...layers.map((l) => l.order)) + 1;
    const name = change.name.trim() || word('board.layers.new', { n: layers.length + 1 });
    return { text: writeBoard({ ...board, layers: [...layers, { id: freeLayerId(board), name, order, more: {} }] }) };
  }
  const layer = find(change.id);
  if (!layer) return { refused: word('board.layers.gone', { id: change.id }) };
  if (change.kind === 'layer-remove')
    return {
      text: writeBoard({
        ...board,
        layers: layers.filter((l) => l !== layer),
        items: board.items.map((i) => (i.more[IN_LAYER] === layer.id ? inLayer(i, null) : i)),
      }),
    };
  // a step up or down: the stack, with the loose items as one of its rows, is numbered again round 0
  const stack: (BoardLayer | null)[] = stacked(board);
  const above = stack.filter((l) => l && l.order > 0).length;
  stack.splice(above, 0, null);
  const at = stack.indexOf(layer);
  const to = at - change.by;
  if (to < 0 || to >= stack.length) return { refused: word('board.layers.edge') };
  [stack[at], stack[to]] = [stack[to] ?? null, stack[at] ?? null];
  const zero = stack.indexOf(null);
  const order = new Map(stack.map((l, i) => [l?.id, zero - i]));
  return { text: writeBoard({ ...board, layers: layers.map((l) => ({ ...l, order: order.get(l.id) ?? l.order })) }) };
}
