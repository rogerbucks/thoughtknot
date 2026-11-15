// The tools of a board, on screen (editor spec §45, board_tools). The person picks one, then works the board with a
// mouse, pen or finger:
//
// - Choose: a press on an item chooses it, a drag moves it. The tool the board starts with.
// - Hand: every press pans, even on an item, so nothing is moved by mistake.
// - Sticky, Text, Shape and Frame: a press on the board makes that item there, then the tool goes back to Choose.
// - Connect: a press on one item, then on another, joins the two. Escape or a press on an empty spot stops it.
//
// Host-free: the host passes each press in and does what comes back. A new item is made where it was asked for. If that
// spot is taken it goes just below, so it never covers another (nodes stay put: nothing else moves).
import { BOARD_KINDS, type Board, type BoardItem, type BoardKind } from './board.ts';
import { freeId } from './board-edit.ts';
import { itemBox } from './board-svg.ts';

/** The tools, in the order the rail shows them. */
export const BOARD_TOOLS = ['choose', 'hand', 'sticky', 'text', 'shape', 'frame', 'connect'] as const;

/** One tool of a board. */
export type BoardTool = (typeof BOARD_TOOLS)[number];

/** The tools that make an item: each makes the kind of its own name. */
const MAKING = new Set<BoardTool>(['sticky', 'text', 'shape', 'frame']);

/** The kind of item a tool makes, or null for a tool that makes none. */
export function toolMakes(tool: BoardTool): BoardKind | null {
  return MAKING.has(tool) ? (BOARD_KINDS.find((k) => k.toLowerCase() === tool) ?? null) : null;
}

/** Whether a made item's text is opened at once: the kinds that are mostly words. */
export function opensText(kind: BoardKind): boolean {
  return kind === 'Sticky' || kind === 'Text' || kind === 'Frame';
}

/**
 * A new item of `kind`, its middle at the spot `at` on the board, in whole numbers. A frame goes behind every other
 * item, as it is made to hold them. When the spot is taken by an item that is not a frame, it moves down until free.
 */
export function madeAt(board: Board, kind: BoardKind, at: [number, number]): BoardItem {
  const item: BoardItem = { id: freeId(board, kind), kind, x: 0, y: 0, more: {} };
  const size = itemBox(item);
  item.x = Math.round(at[0] - size.w / 2);
  item.y = Math.round(at[1] - size.h / 2);
  if (kind === 'Frame') {
    const layers = board.items.map((i) => i.layer ?? 0);
    item.layer = layers.length ? Math.min(0, ...layers) - 1 : -1;
    return item; // a frame is drawn behind, so it may go over other items
  }
  // a frame holds items, so a new item inside one is not on top of anything
  const boxes = board.items.filter((i) => i.kind !== 'Frame').map(itemBox);
  const taken = () => {
    const b = itemBox(item);
    return boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  };
  for (let tries = 0; tries < 200 && taken(); tries++) item.y += Math.round(size.h / 2);
  return item;
}

/** What a press on the board does with a tool. */
export type ToolPress =
  /** Let the board do what it does without tools: choose, drag or pan. */
  | { kind: 'pass' }
  /** Pan the view; never take the item. */
  | { kind: 'pan' }
  /** Make this item and go back to Choose. */
  | { kind: 'make'; item: BoardItem }
  /** An item to join from; wait for the second. */
  | { kind: 'from'; id: string }
  /** Join these two items. */
  | { kind: 'join'; from: string; to: string }
  /** The join was let go. */
  | { kind: 'stop' };

/**
 * What a press does with `tool`, on the item `on` (or an empty spot), at the spot `at` on the board. `from` is the
 * item a join started on, if any. A read-only board takes no tool but Choose and Hand.
 */
export function toolPress(
  board: Board,
  tool: BoardTool,
  on: string | null,
  at: [number, number],
  from: string | null,
  readOnly = false,
): ToolPress {
  if (tool === 'hand') return { kind: 'pan' };
  if (tool === 'choose' || readOnly) return { kind: 'pass' };
  const kind = toolMakes(tool);
  if (kind) return { kind: 'make', item: madeAt(board, kind, at) };
  // connect
  if (!on) return from ? { kind: 'stop' } : { kind: 'pan' };
  if (!from || from === on) return { kind: 'from', id: on };
  return { kind: 'join', from, to: on };
}
