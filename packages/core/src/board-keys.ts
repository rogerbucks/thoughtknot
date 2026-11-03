// A board worked by the keyboard alone (editor spec §45, board_keyboard). Host-free: the host passes each key in and
// does what comes back. Each step says what happened in words, for a screen reader.
//
// - Tab and Shift+Tab go from item to item in the outline's order, top to bottom. Past the last, Tab leaves the board.
// - The arrow keys move the item in focus, Shift for a bigger step. With no item in focus they pan the board.
// - Alt and the arrow keys size the item in focus: right and down make it bigger, left and up smaller.
// - N makes a sticky note beside the item in focus, or in the middle of the view, and opens its text.
// - Enter opens the text of the item in focus.
// - C starts a connector from the item in focus; C again on another item joins the two. Escape stops it.
// - Delete or Backspace takes the item in focus out, with its connectors.
// - Escape lets go of the item in focus.
import { writeBoard } from './board.ts';
import type { Board, BoardItem } from './board.ts';
import { boardEdit, MIN_SIDE, newItem } from './board-edit.ts';
import type { BoardChange } from './board-edit.ts';
import { boardOutline, itemBox, itemSaid } from './board-svg.ts';
import { word } from './words.ts';

/** Where the keyboard is on a board: the item in focus, and the item a connector is being drawn from. */
export interface BoardCursor {
  focus: string | null;
  linking: string | null;
}

/** A key as pressed, with the keys held with it. */
export interface BoardPress {
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

/** What a key does: where the keyboard is now, and an edit to write, a pan in pixels, an item's text to open, words. */
export interface BoardStep {
  cursor: BoardCursor;
  change?: BoardChange;
  pan?: [number, number];
  edit?: string;
  said?: string;
}

/** How far an arrow moves or sizes an item, in board units, and with Shift; and how far it pans, in pixels. */
export const STEP = 10,
  BIG_STEP = 50,
  PAN_STEP = 40;

/** No item in focus and no connector begun. */
export const NO_CURSOR: BoardCursor = { focus: null, linking: null };

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * What `press` does on `board` with the keyboard at `cursor`. `centre` is the middle of the view, in board units, where
 * an item made with nothing in focus goes. `readOnly` boards can be gone through, panned and heard, never changed. Null
 * when the key is not the board's, so the host leaves it to the zoom or the browser.
 */
export function boardKey(
  board: Board,
  cursor: BoardCursor,
  press: BoardPress,
  centre: [number, number],
  readOnly = false,
): BoardStep | null {
  if (press.ctrl || press.meta) return null;
  const focus = board.items.find((i) => i.id === cursor.focus) ?? null;
  const at = (item: BoardItem | null, said?: string): BoardStep => ({
    cursor: { focus: item?.id ?? null, linking: item ? cursor.linking : null },
    said: said ?? (item ? itemSaid(board, item) : undefined),
  });
  const { key } = press;
  if (key === 'Tab') return tabbed(board, cursor, focus, !!press.shift);
  if (key === 'Escape') {
    if (cursor.linking) return { cursor: { ...cursor, linking: null }, said: word('board.connect-stopped') };
    return focus ? at(null, word('board.let-go')) : null;
  }
  const arrow = ARROWS[key];
  if (arrow && !focus) {
    if (press.alt) return null;
    const step = press.shift ? PAN_STEP * 4 : PAN_STEP;
    return { cursor, pan: [-arrow[0] * step, -arrow[1] * step] }; // the view moves the other way: as a drag does
  }
  if (readOnly) return null;
  const lower = key.toLowerCase();
  if (lower === 'n' && !press.alt) {
    const item = newItem(board, 'Sticky', focus, centre);
    return {
      cursor: { focus: item.id, linking: null },
      change: { kind: 'add', item },
      edit: item.id,
      said: word('board.made', { kind: word('board.kind.sticky') }),
    };
  }
  if (!focus) return null;
  if (arrow) {
    if (focus.locked) return at(focus, word('board.edit.locked'));
    const step = press.shift ? BIG_STEP : STEP;
    if (press.alt) {
      const box = itemBox(focus);
      const w = Math.max(MIN_SIDE, box.w + arrow[0] * step),
        h = Math.max(MIN_SIDE, box.h + arrow[1] * step);
      return change(board, cursor, { kind: 'size', id: focus.id, w, h }, word('board.sized', { w, h }));
    }
    const x = focus.x + arrow[0] * step,
      y = focus.y + arrow[1] * step;
    return change(board, cursor, { kind: 'move', id: focus.id, x, y }, word('board.moved', { x, y }));
  }
  if (key === 'Enter' || key === 'F2') return { cursor, edit: focus.id };
  if (lower === 'c' && !press.alt) {
    if (!cursor.linking || cursor.linking === focus.id)
      return {
        cursor: { focus: focus.id, linking: focus.id },
        said: word('board.connect-from', { item: said(focus) }),
      };
    const from = board.items.find((i) => i.id === cursor.linking);
    const step = change(
      board,
      { focus: focus.id, linking: null },
      { kind: 'connect', from: cursor.linking, to: focus.id },
    );
    return 'change' in step && from
      ? { ...step, said: word('board.joined', { from: said(from), to: said(focus) }) }
      : step;
  }
  if (key === 'Delete' || key === 'Backspace') {
    if (focus.locked) return at(focus, word('board.edit.locked'));
    const order = boardOutline(board).map((l) => l.id);
    const next = order[order.indexOf(focus.id) + 1] ?? order[order.indexOf(focus.id) - 1] ?? null;
    const step = change(board, { focus: next, linking: null }, { kind: 'remove', id: focus.id });
    return 'change' in step ? { ...step, said: word('board.taken-out', { item: said(focus) }) } : step;
  }
  return null;
}

/** An item named short, for what is said of a change: its kind and text. */
const said = (item: BoardItem) => itemSaid({ name: '', on: null, items: [item], connectors: [] }, item);

/**
 * A step that writes `edit` and says `say`. Refused, it writes nothing and says why. The host's write checks it again,
 * against the note as it is then.
 */
function change(board: Board, cursor: BoardCursor, edit: BoardChange, say?: string): BoardStep {
  const tried = boardEdit(writeBoard(board), edit);
  if ('refused' in tried) return { cursor, said: tried.refused };
  return { cursor, change: edit, said: say };
}

/** Tab and Shift+Tab: the next or last item in the outline's order. Null past either end, so focus leaves the board. */
function tabbed(board: Board, cursor: BoardCursor, focus: BoardItem | null, back: boolean): BoardStep | null {
  const order = boardOutline(board).map((l) => l.id);
  if (!order.length) return null;
  const now = focus ? order.indexOf(focus.id) : back ? order.length : -1;
  const id = order[now + (back ? -1 : 1)];
  if (id === undefined) return null;
  const item = board.items.find((i) => i.id === id) as BoardItem;
  const joining = cursor.linking ? ` ${word('board.connect-press')}` : '';
  return { cursor: { focus: id, linking: cursor.linking }, said: itemSaid(board, item) + joining };
}
