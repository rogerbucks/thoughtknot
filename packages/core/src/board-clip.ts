// Copy, paste and duplicate on a board (editor spec §45, board_handles). Host-free: the host keeps what was copied
// and writes what a paste makes.
//
// - Copy takes the chosen items, and the connectors between two of them. Nothing is written.
// - Paste makes them again, each with a new name and the same places among each other, round the spot asked for.
// - Duplicate is a copy pasted just beside the items, so the copy never covers them.
//
// The pasted items are new. They link to no thing of the graph, since a thing is linked from one item only. They carry
// no votes, comments or lock, which belonged to the items copied. Nothing already on the board moves.
import type { Board, BoardItem, Connector } from './board.ts';
import { freeId, GAP } from './board-edit.ts';
import type { BoardChange } from './board-edit.ts';
import { itemBox } from './board-svg.ts';

/** What was copied: the items and the connectors between them, as they were. */
export interface BoardClip {
  items: BoardItem[];
  connectors: Connector[];
}

// what an item copied keeps: its own look and words, not what belonged to the item itself
const KEPT_MORE = new Set(['glyph', 'body', 'links', 'attachments', 'points', 'shape', 'src', 'alt']);

/** The items `ids` of the board, and the connectors between two of them; null when none of them is there. */
export function copyItems(board: Board, ids: readonly string[]): BoardClip | null {
  const want = new Set(ids);
  const items = board.items.filter((i) => want.has(i.id));
  if (!items.length) return null;
  const connectors = board.connectors.filter((c) => want.has(c.from) && want.has(c.to));
  return { items: items.map((i) => ({ ...i, more: { ...i.more } })), connectors: connectors.map((c) => ({ ...c })) };
}

/** The box round every item copied. */
function clipBox(clip: BoardClip) {
  const boxes = clip.items.map(itemBox);
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/**
 * The change that pastes `clip` onto the board with the middle of what was copied at `at`, and the new names in the
 * order copied. Each item gets a free name, and the connectors join the new names.
 */
export function pasteClip(board: Board, clip: BoardClip, at: [number, number]): { change: BoardChange; ids: string[] } {
  const box = clipBox(clip);
  const dx = Math.round(at[0] - (box.x + box.w / 2)),
    dy = Math.round(at[1] - (box.y + box.h / 2));
  const named = new Map<string, string>();
  const growing: Board = { ...board, items: [...board.items] };
  const items = clip.items.map((was) => {
    const id = freeId(growing, was.kind);
    named.set(was.id, id);
    const more = Object.fromEntries(Object.entries(was.more).filter(([k]) => KEPT_MORE.has(k)));
    const item: BoardItem = { id, kind: was.kind, x: was.x + dx, y: was.y + dy, more };
    for (const k of ['w', 'h', 'layer', 'text', 'style'] as const)
      if (was[k] !== undefined) Object.assign(item, { [k]: was[k] });
    growing.items.push(item);
    return item;
  });
  // a group named in the copy is a new group of the pasted items, so they move together and apart from the first
  const groups = new Map<string, string>();
  for (const [i, was] of clip.items.entries()) {
    if (!was.group) continue;
    if (!groups.has(was.group)) groups.set(was.group, `${was.group}-${items[0]?.id ?? 'copy'}`);
    const item = items[i];
    if (item) item.group = groups.get(was.group);
  }
  const connectors = clip.connectors.flatMap((c) => {
    const from = named.get(c.from),
      to = named.get(c.to);
    return from && to ? [c.label === undefined ? { from, to } : { from, to, label: c.label }] : [];
  });
  return { change: { kind: 'adds', items, connectors }, ids: items.map((i) => i.id) };
}

/** The change that duplicates the items `ids`, put just right of them, and the new names; null when none is there. */
export function duplicateItems(board: Board, ids: readonly string[]): { change: BoardChange; ids: string[] } | null {
  const clip = copyItems(board, ids);
  if (!clip) return null;
  const box = clipBox(clip);
  return pasteClip(board, clip, [box.x + box.w * 1.5 + GAP, box.y + box.h / 2]);
}
