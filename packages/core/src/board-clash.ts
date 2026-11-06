// A clash flagged on a board item (editor spec §45, board_offline_merge). When two edits made apart changed one thing
// differently, the merge keeps both sides and flags them. The flag is a property of the item that names the item it
// clashed with. It stays until someone settles it. Settling takes the flag off and moves nothing. Pure and host-free.
import type { Board, BoardItem } from './board.ts';

/** The property that marks a clash on an item: it holds the name of the item it clashed with. */
export const CLASH = 'clash';

/** The name of the item that `item` clashed with, or nothing when it is not flagged. */
export function clashOf(item: BoardItem): string | undefined {
  const other = item.more[CLASH];
  return typeof other === 'string' && other ? other : undefined;
}

/** Every flagged item of the board, in the order written. */
export function clashed(board: Board): BoardItem[] {
  return board.items.filter((i) => clashOf(i) !== undefined);
}

/** The item with its flag taken off; every other property is kept as it is. */
export function settled(item: BoardItem): BoardItem {
  const more = { ...item.more };
  delete more[CLASH];
  return { ...item, more };
}
