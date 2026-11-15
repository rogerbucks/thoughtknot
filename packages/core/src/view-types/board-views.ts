// A view of a graph kept on a board (editor spec ES§45, board_view_items; B1). A View item shows a graph of the note
// drawn by one of the view types, such as force or matrix. It is drawn live from the note each time the board is, so
// it never goes stale. It shows the board's own graph unless its `of` names another. One whose `board` names a board
// of the note shows that board (board_nested). Its `view` names the type; with
// none it is force. It only shows the graph: nothing on the board or in the graph moves when it is drawn.
// Host-free and pure: the host gives the note, and nests the picture in the item.
import { gqlBlocks } from '../blocks.ts';
import { boardOf, readBoard, type Board, type BoardItem } from '../board.ts';
import { nestedBoardOf } from '../board-nest.ts';
import { boardSvg, itemBox, type Box } from '../board-svg.ts';
import { readNote } from '../drawing.ts';
import { diagramDrawing } from '../plugin-diagrams.ts';
import { shapeOf } from '../types-shape.ts';
import { VIEW_DRAWERS, VIEW_TYPES, type ViewType } from './view-types.ts';
import { word } from '../words.ts';

/** The colours a board is drawn in. */
type Palette = Parameters<typeof boardSvg>[1];

/** The view type an item shows: its own `view` where it names one, else force. */
export function viewTypeOf(item: BoardItem): ViewType {
  const v = item.more.view;
  return typeof v === 'string' && (VIEW_TYPES as readonly string[]).includes(v) ? (v as ViewType) : 'force';
}

/** The graph an item shows: its own `of` where written, else the board's. */
export function viewGraphOf(board: Board, item: BoardItem): string | null {
  const of = item.more.of;
  return typeof of === 'string' && of ? of : board.on;
}

/** Room left in a view's frame for its name above the picture, and round it, in board units. */
const TOP = 22,
  PAD = 6;

/** Where a view's picture goes: inside its frame, below its name. */
export function viewSpace(item: BoardItem): Box {
  const box = itemBox(item);
  return { x: box.x + PAD, y: box.y + TOP, w: Math.max(1, box.w - 2 * PAD), h: Math.max(1, box.h - TOP - PAD) };
}

// the core's view types, found by their own name alone: nothing a plug-in adds is drawn on a board yet
const drawing = diagramDrawing(
  (type) => {
    if (!(VIEW_TYPES as readonly string[]).includes(type)) return undefined;
    return { d: { type, title: type, draw: VIEW_DRAWERS[type as ViewType] }, plugin: 'board' };
  },
  async (plugin, _what, call) => {
    try {
      return { ok: true, value: await call() };
    } catch (e) {
      return { ok: false, plugin, message: String(e) };
    }
  },
);

/** The view item `id` of the board `board` in `note`, drawn as an SVG picture its own size, or why not, in words. */
export async function drawBoardView(
  note: string,
  board: Board,
  id: string,
  palette?: Palette,
): Promise<{ svg: string } | { refused: string }> {
  const item = board.items.find((i) => i.id === id && i.kind === 'View');
  if (!item) return { refused: word('board.view.gone') };
  const inner = nestedBoardOf(item);
  if (inner) {
    // a view of a board shows that board as it is written now: its items, and only the frames of its own views
    const text = gqlBlocks(note).find((b) => boardOf(b.text)?.name === inner)?.text;
    if (text === undefined) return { refused: word('board.edit.board-gone', { name: inner }) };
    // a host that gives no colours shows the board's name alone
    if (!palette) return { refused: word('board.nest.said', { name: inner }) };
    return { svg: boardSvg(readBoard(text).board, palette) };
  }
  const of = viewGraphOf(board, item);
  if (!of) return { refused: word('board.view.no-graph') };
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const drawn = reading.graphs.get(of);
  if (!drawn || !drawn.boxes.length) return { refused: word('board.view.empty', { graph: of }) };
  const box = viewSpace(item);
  const r = await drawing.drawDiagram(viewTypeOf(item), shapeOf(drawn, reading.world[of]), {
    width: box.w,
    height: box.h,
  });
  return r.ok ? { svg: r.value } : { refused: r.message };
}

/** What a host gives its board so its View items are drawn: each from the note as it is now. */
export function viewerOf(
  note: () => string | Promise<string>,
  palette?: Palette,
): (board: Board, id: string) => Promise<{ svg: string } | { refused: string }> {
  return async (board, id) => drawBoardView(await note(), board, id, palette);
}
