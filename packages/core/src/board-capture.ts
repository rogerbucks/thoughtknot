// Quick capture on a board (editor spec §45, board_quick_capture). Ideas are caught as fast as they are said. Typing on
// an empty spot makes a sticky note with what was typed. Enter then makes the next one beside it. Tab makes a child
// below it, joined to it by a connector. Each step is a list of edits, written as one, and nothing already on the
// board moves (nodes stay put). Pure and host-free: the host passes in what was typed and does what comes back.
import type { Board, BoardItem } from './board.ts';
import { boardEdit, GAP, newItem } from './board-edit.ts';
import type { BoardChange } from './board-edit.ts';
import { writeBoard } from './board.ts';
import { itemBox, itemSaid } from './board-svg.ts';
import { word } from './words.ts';

/** How a note is caught: on an empty spot, as the next one beside the last, or as a child joined to the last. */
export type CaptureHow = 'spot' | 'next' | 'child';

/** What a capture does: the new item, the edits that write it, and words for a screen reader. Or why it was refused. */
export type Captured = { item: BoardItem; changes: BoardChange[]; said: string } | { refused: string };

/**
 * The sticky note caught with `text`. `from` is the note last caught, which `next` and `child` go from. `spot` is where
 * a note on an empty spot goes, as its middle. Text with nothing in it catches nothing.
 */
export function capture(
  board: Board,
  how: CaptureHow,
  text: string,
  from: BoardItem | null,
  spot: [number, number],
): Captured {
  const typed = text.trim();
  if (!typed) return { refused: word('board.capture.empty') };
  if (how !== 'spot' && !from) return { refused: word('board.capture.nothing-before') };
  const item = newItem(board, 'Sticky', how === 'next' ? from : null, how === 'child' ? [0, 0] : spot);
  item.text = typed;
  if (how === 'child' && from) placeBelow(board, item, from);
  const changes: BoardChange[] = [{ kind: 'add', item }];
  if (how === 'child' && from) changes.push({ kind: 'connect', from: from.id, to: item.id });
  // the same edits on a copy of the board, so a refusal is told before anything is written
  let written = writeBoard(board);
  for (const change of changes) {
    const r = boardEdit(written, change);
    if ('refused' in r) return { refused: r.refused };
    written = r.text;
  }
  const said = word(
    how === 'spot' ? 'board.capture.spot' : how === 'next' ? 'board.capture.next' : 'board.capture.child',
    { item: itemSaid({ ...board, items: [item], connectors: [] }, item) },
  );
  return { item, changes, said };
}

/** `item` placed straight below `from`, moved down a step at a time while the room is taken. */
function placeBelow(board: Board, item: BoardItem, from: BoardItem): void {
  const above = itemBox(from);
  item.x = Math.round(above.x);
  item.y = Math.round(above.y + above.h + GAP);
  const boxes = board.items.map(itemBox);
  const size = itemBox(item);
  const taken = () => {
    const b = itemBox(item);
    return boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  };
  for (let tries = 0; tries < 200 && taken(); tries++) item.y += Math.round(size.h / 2);
}
