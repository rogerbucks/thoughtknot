// A whiteboard file brought into a note, and a note's boards written out as files (editor spec ES§45,
// board_exchange). The file's ending says which of our own readers and writers is used: JSON Canvas
// (board-canvas.ts) or Excalidraw (board-excalidraw.ts). Host-free: the host reads and writes the files.
// - In: the file becomes a board block of its own at the end of the note. It is a copy: the file is never written.
// - Out: each board of the note becomes one file. The note is never written.
import { gqlSpans } from './blocks.ts';
import { boardOf, readBoard, writeBoard } from './board.ts';
import { boardCanvas, canvasBoard } from './board-canvas.ts';
import { boardExcalidraw, excalidrawBoard } from './board-excalidraw.ts';
import { word } from './words.ts';

/** A whiteboard format the board can be read from and written as. */
export type BoardFormat = 'canvas' | 'excalidraw';

/** A board block made from a file, with a sentence for each kind of thing left out; or why none was made. */
export type BoardBlock = { block: string; notes: string[] } | { refused: string };

/** One board written as a file: the file's name, its text, and a sentence for each kind of thing left out. */
export interface BoardFile {
  name: string;
  text: string;
  notes: string[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The whiteboard format a file holds, by its ending; null when it is no whiteboard file. */
export function boardFormatOf(path: string): BoardFormat | null {
  if (/\.canvas$/i.test(path)) return 'canvas';
  return /\.excalidraw(\.md)?$/i.test(path) ? 'excalidraw' : null;
}

/**
 * The board block that holds the whiteboard file at `path`, whose text is `text`: fenced as a note holds it, and named
 * `graph`. Refused: a graph name that is no name, a file of no known ending, and a file its reader refuses.
 */
export function boardFileBlock(graph: string, path: string, text: string): BoardBlock {
  if (!NAME.test(graph)) return { refused: word('import.not-graph-name', { graph }) };
  const format = boardFormatOf(path);
  if (!format) return { refused: word('import.board.not-board', { file: path }) };
  const read = format === 'canvas' ? canvasBoard(text, graph) : excalidrawBoard(text, graph);
  if ('refused' in read) return { refused: read.refused };
  return { block: `\`\`\`gql\n${writeBoard(read.board)}\n\`\`\``, notes: read.notes };
}

/** Each board of the note written as a file of `format`, named after its board, in the order the note holds them. */
export function boardFilesOf(note: string, format: BoardFormat): BoardFile[] {
  return gqlSpans(note).flatMap((span) => {
    if (!boardOf(span.text)) return [];
    const { board } = readBoard(span.text);
    const out = format === 'canvas' ? boardCanvas(board) : boardExcalidraw(board);
    return [{ name: `${board.name}.${format}`, text: out.json, notes: out.notes }];
  });
}
