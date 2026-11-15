// The named layers of a board (editor spec §45, board_layers). A layer is a `Layer` thing in the board block, and an
// item is on it when its `sheet` names it. A layer can be hidden, locked, and put over or under another. A hidden
// layer's items are not drawn and cannot be reached. A locked layer's items stay as they are. The layers are plain data
// of the block and say nothing of how they are drawn, so any other view can show them too. Pure and host-free.
import { readBoard } from './board.ts';
import type { Board, BoardItem, BoardLayer } from './board.ts';
import { word } from './words.ts';

/** The layer an item is on, when the board holds it. An item on none, or on one that is gone, is on the board itself. */
export function layerOf(board: Board, item: BoardItem): BoardLayer | null {
  const sheet = item.more.sheet;
  return typeof sheet === 'string' ? (board.layers?.find((l) => l.id === sheet) ?? null) : null;
}

/** Whether an item may not be moved, sized or taken out: it is locked itself, or its layer is. */
export function lockedIn(board: Board, item: BoardItem): boolean {
  return !!item.locked || !!layerOf(board, item)?.locked;
}

/** Why an item may not be changed, in words: its layer is locked, else it is. */
export function lockedSaid(board: Board, item: BoardItem): string {
  const layer = layerOf(board, item);
  return layer?.locked ? word('board.layer.locked-item', { name: layer.name }) : word('board.edit.locked');
}

/** How high an item's layer is drawn: 0 for the board itself, then each layer by its order. */
export function stackOf(board: Board, item: BoardItem): number {
  return layerOf(board, item)?.order ?? 0;
}

/** The layers of a board, the one drawn on top first, as a list of layers shows them. */
export function layersTopFirst(board: Board): BoardLayer[] {
  return [...(board.layers ?? [])].sort((a, b) => b.order - a.order);
}

/**
 * The board as it is shown and worked on. The items of hidden layers are set aside in `unseen`, so a connector that
 * ends on one is not drawn. An item on a locked layer is locked, so it is never dragged. This board is for the screen:
 * every edit is made to the block's own text.
 */
export function shownBoard(board: Board): Board {
  if (!board.layers?.length) return board;
  const hidden = (i: BoardItem) => !!layerOf(board, i)?.hidden;
  return {
    ...board,
    items: board.items.filter((i) => !hidden(i)).map((i) => (lockedIn(board, i) ? { ...i, locked: true } : i)),
    unseen: board.items.filter(hidden),
  };
}

/** The board a block holds, as it is shown and worked on. */
export const readShown = (text: string): Board => shownBoard(readBoard(text).board);

/** One thing asked of a board's layers. `put` moves items to the layer `id`, or back to the board itself for null. */
export type LayerAsk =
  | { kind: 'add'; name: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'show'; id: string; shown: boolean }
  | { kind: 'lock'; id: string; locked: boolean }
  | { kind: 'raise'; id: string; by: 1 | -1 }
  | { kind: 'remove'; id: string }
  | { kind: 'put'; items: readonly string[]; id: string | null };

/** The longest name a layer may have. */
export const LAYER_NAME_MOST = 60;

/** A name for a new layer thing that nothing on the board has: its name in small letters, else layer1, layer2. */
function freeLayerId(board: Board, name: string): string {
  const used = new Set([...board.items, ...(board.layers ?? [])].map((i) => i.id));
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'layer';
  const base = /^[a-z_]/.test(stem) ? stem : `layer_${stem}`;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** A layer's name as kept: trimmed, and never empty or too long; else why not, in words. */
function nameOf(name: string): string | { refused: string } {
  const kept = name.trim().replace(/\s+/g, ' ');
  if (!kept) return { refused: word('board.layer.no-name') };
  return kept.length > LAYER_NAME_MOST ? { refused: word('board.layer.long-name', { most: LAYER_NAME_MOST }) } : kept;
}

/** The item with its layer set to `id`, or taken off for null. */
function onLayer(item: BoardItem, id: string | null): BoardItem {
  const { sheet: _was, ...rest } = item.more;
  return { ...item, more: id === null ? rest : { ...rest, sheet: id } };
}

/**
 * The board with `ask` done to its layers, or why it was refused, in words. A new layer goes on top. A layer removed
 * leaves its items on the board itself: no item is ever taken out with its layer.
 */
export function layersEdit(board: Board, ask: LayerAsk): Board | { refused: string } {
  const layers = board.layers ?? [];
  if (ask.kind === 'add') {
    const name = nameOf(ask.name);
    if (typeof name !== 'string') return name;
    const order = Math.max(0, ...layers.map((l) => l.order)) + 1;
    return { ...board, layers: [...layers, { id: freeLayerId(board, name), name, order, more: {} }] };
  }
  if (ask.kind === 'put') {
    if (ask.id !== null && !layers.some((l) => l.id === ask.id))
      return { refused: word('board.layer.gone', { id: ask.id }) };
    const moved = new Set(ask.items);
    if (!board.items.some((i) => moved.has(i.id))) return { refused: word('board.layer.none-chosen') };
    return { ...board, items: board.items.map((i) => (moved.has(i.id) ? onLayer(i, ask.id) : i)) };
  }
  const layer = layers.find((l) => l.id === ask.id);
  if (!layer) return { refused: word('board.layer.gone', { id: ask.id }) };
  const set = (patch: Partial<BoardLayer>): Board => ({
    ...board,
    layers: layers.map((l) => (l === layer ? { ...l, ...patch } : l)),
  });
  switch (ask.kind) {
    case 'rename': {
      const name = nameOf(ask.name);
      return typeof name === 'string' ? set({ name }) : name;
    }
    case 'show':
      return set({ hidden: !ask.shown });
    case 'lock':
      return set({ locked: ask.locked });
    case 'raise': {
      // it changes places with the layer next over it, or next under it
      const sorted = [...layers].sort((a, b) => a.order - b.order);
      const other = sorted[sorted.indexOf(layer) + ask.by];
      if (!other) return { refused: word(ask.by > 0 ? 'board.layer.top' : 'board.layer.bottom') };
      const swap = (l: BoardLayer) =>
        l === layer ? { ...l, order: other.order } : l === other ? { ...l, order: layer.order } : l;
      return { ...board, layers: layers.map(swap) };
    }
    case 'remove':
      return {
        ...board,
        layers: layers.filter((l) => l !== layer),
        items: board.items.map((i) => (i.more.sheet === layer.id ? onLayer(i, null) : i)),
      };
  }
}
