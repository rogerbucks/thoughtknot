// The boards of a note, as a list to switch between (editor spec §45, board_many). A note holds as many boards as the
// person makes, each its own block. This names them, and adds, renames, copies and removes one. Each change touches
// only that board's block: every other byte of the note is kept. Host-free and pure.
import { boardOf, gqlBlocks } from './blocks.ts';
import { readBoard } from './board.ts';
import { boardEditInNote, newItem } from './board-edit.ts';
import { gqlSpans } from './fences.ts';
import { replaceSpan } from './store.ts';
import { word } from './words.ts';

/** A changed note and the board the change left in front, or why the change was refused. */
export type BoardListChange = { note: string; name: string | null } | { refused: string };

/** The name of each board in the note, in the order written. */
export function boardNames(note: string): string[] {
  return gqlSpans(note).flatMap((s) => boardOf(s.text)?.name ?? []);
}

/** The name on a block's graph line: the word after `graph:`. */
function nameOf(text: string): string {
  return /graph:\s*(\S+)/.exec(text.split('\n')[0] ?? '')?.[1] ?? '';
}

/** A name no block of the note has yet: `base`, else `base_2`, `base_3` and so on. */
export function freeBoardName(note: string, base: string): string {
  const taken = new Set(gqlBlocks(note).map((b) => nameOf(b.text)));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
}

/** The first line of a board block named `name`, on the graph `on` or free. */
const head = (name: string, on: string | null): string => `// graph: ${name} · BOARD${on ? ` ON ${on}` : ''}`;

/** The note with a block written at its end. */
function withBlock(note: string, text: string): string {
  const body = note.trimEnd();
  return `${body}${body ? '\n\n' : ''}\`\`\`gql\n${text}\n\`\`\`\n`;
}

/** The note with a new, empty board at its end, on the graph `on` or free. */
export function boardAdded(note: string, on: string | null): { note: string; name: string } {
  const name = freeBoardName(note, word('board.list.new-name'));
  return { note: withBlock(note, head(name, on)), name };
}

/** The note with the board `from` named `to`. Refused when the name is not one a graph can have, or is taken. */
export function boardRenamed(note: string, from: string, to: string): BoardListChange {
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === from);
  const was = span && boardOf(span.text);
  if (!span || !was) return { refused: word('board.edit.board-gone', { name: from }) };
  const name = to.trim();
  if (name === from) return { note, name };
  if (boardOf(head(name, was.on))?.name !== name) return { refused: word('board.list.bad-name', { name }) };
  if (freeBoardName(note, name) !== name) return { refused: word('board.list.taken', { name }) };
  const lines = span.text.split('\n');
  return { note: replaceSpan(note, span, [head(name, was.on), ...lines.slice(1)].join('\n')).note, name };
}

/** The note with a copy of the board `name` at its end, under a free name. */
export function boardCopied(note: string, name: string): BoardListChange {
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === name);
  const was = span && boardOf(span.text);
  if (!span || !was) return { refused: word('board.edit.board-gone', { name }) };
  const copy = freeBoardName(note, `${name}_copy`);
  return { note: withBlock(note, [head(copy, was.on), ...span.text.split('\n').slice(1)].join('\n')), name: copy };
}

/** The note without the board `name`: its block is taken out, and the board before it comes in front. */
export function boardRemoved(note: string, name: string): BoardListChange {
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === name);
  if (!span) return { refused: word('board.edit.board-gone', { name }) };
  const lines = note.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const blank = (i: number) => (lines[i] ?? '').trim() === '';
  // the blank line after the block goes with it, when one stood before it too, so no gap is left behind
  const after = blank(span.close + 1) && (span.open === 0 || blank(span.open - 1)) ? 1 : 0;
  lines.splice(span.open, span.close - span.open + 1 + after);
  const next = lines.join('');
  const names = boardNames(note);
  const left = boardNames(next);
  return { note: next, name: left[Math.max(0, names.indexOf(name) - 1)] ?? null };
}

/** What the person asks of the list: a new board, or the board in front renamed, copied or removed. */
export type BoardListAsk =
  | { kind: 'add' }
  | { kind: 'copy' }
  | { kind: 'remove' }
  | { kind: 'rename'; to: string }
  /** A new board made, with a view of it put on the board in front. */
  | { kind: 'nest' };

/**
 * The note with a new, empty board made, and a view of it put on the board `current` in free room (board_nested). The
 * board in front stays `current`: the new one is entered by zooming in on its view.
 */
export function boardNested(note: string, current: string): BoardListChange {
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === current);
  const was = span && boardOf(span.text);
  if (!span || !was) return { refused: word('board.edit.board-gone', { name: current }) };
  const made = boardAdded(note, was.on);
  const board = readBoard(span.text).board;
  const item = newItem(board, 'View', board.items[board.items.length - 1] ?? null, [200, 150]);
  const r = boardEditInNote(made.note, current, { kind: 'add', item: { ...item, more: { board: made.name } } });
  return 'refused' in r ? r : { note: r.note, name: current };
}

/** The note with `ask` done to its board `current`, and the board then in front. A new board is on the same graph. */
export function boardListChanged(note: string, current: string, ask: BoardListAsk): BoardListChange {
  if (ask.kind === 'rename') return boardRenamed(note, current, ask.to);
  if (ask.kind === 'copy') return boardCopied(note, current);
  if (ask.kind === 'remove') return boardRemoved(note, current);
  if (ask.kind === 'nest') return boardNested(note, current);
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === current);
  return boardAdded(note, (span && boardOf(span.text)?.on) ?? null);
}
