// The whiteboard first: a graph built from nothing (editor spec ES§76). Host-free and pure.
// - A note with no graph and no board opens on an empty board (board_first_new_note). Like the starter board of a note
//   with graphs (board-starter.ts), it is written to the note only when the person first makes something on it.
// - An empty board offers the ways to begin: type, text to graph and import (board_first_ways_in). They go once the
//   first item is made.
// - Text on a board goes to an AI through text to graph and the one way anything is sent (ai.ts), under the AI rules
//   of ES§19 (board_first_ai). The answer is drawn as proposed cards and connectors, written only when accepted.
// - A whiteboard file, a deck, another note's graph or a text graph lands in a frame of its own on clear space, as one
//   change and one undo (board_first_import).
import type { SendAsk, SendRefused } from './ai.ts';
import { gqlBlocks, gqlSpans } from './blocks.ts';
import { boardOf, readBoard, writeBoard } from './board.ts';
import type { Board, BoardItem, Connector } from './board.ts';
import { freeName } from './board-canvas.ts';
import { boardFileBlock } from './board-exchange.ts';
import { freeBoardName } from './board-list.ts';
import { starterBoard, withStarter } from './board-starter.ts';
import { itemBox } from './board-svg.ts';
import type { BoardChange } from './board-edit.ts';
import { readNote } from './drawing.ts';
import { namesOf } from './proposals-apply.ts';
import type { Proposal } from './proposals.ts';
import { replaceSpan } from './store.ts';
import { textToGraphAsk } from './text-to-graph.ts';
import { noteWithTextGraphApplied, tickedOnly } from './text-to-graph-note.ts';
import { word } from './words.ts';

/** The graph a note started on a board builds, before the note names any: `ideas`, or the next free name. */
export const FIRST_GRAPH = 'ideas';

/** The room a frame leaves round what it holds, and the gap between it and what is on the board already. */
const ROOM = 40,
  GAP = 80;
/** The size of a card a graph puts on a board, and the most cards in a row of a frame. */
const CARD = [220, 120] as const,
  ROW = 4;

/** A board a note opens on: its name and block text, and whether it is still to be written (a starter or empty one). */
export interface OpeningBoard {
  name: string;
  text: string;
  starter: boolean;
}

/** The empty board of a note with no graph and no board: free, on no graph yet, named after the graph it will build. */
export function emptyBoard(note: string): { name: string; text: string } {
  const graph = freeBoardName(note, FIRST_GRAPH);
  const name = freeBoardName(note, `${graph}_board`);
  return { name, text: writeBoard({ name, on: null, items: [], connectors: [] }) };
}

/**
 * The board a note opens on when it holds none: its starter board when it has graphs, else an empty one. Null for a
 * note that has a board, which opens on that. Nothing is written: the host writes it with `withStarter` on the first
 * change, so opening a note never changes it.
 */
export function openingBoard(note: string, isBoard: (text: string) => boolean): OpeningBoard | null {
  if (gqlBlocks(note).some((b) => isBoard(b.text))) return null;
  const made = starterBoard(note, isBoard) ?? emptyBoard(note);
  return { ...made, starter: true };
}

/** One way to begin on an empty board. `off` says why it cannot be used now, such as AI being off. */
export interface WayIn {
  way: 'type' | 'text-to-graph' | 'import';
  name: string;
  sentence: string;
  off?: string;
}

/**
 * The ways to begin on a board: type a note, give text to an AI to turn into a graph, or import. None once the board
 * holds an item. `aiOff` is why AI cannot be used now, when it cannot; the way is still shown, saying so.
 */
export function waysIn(board: Board, aiOff?: string): WayIn[] {
  if (board.items.length) return [];
  const way = (w: WayIn['way']): WayIn => ({
    way: w,
    name: word(`board.first.${w}`),
    sentence: word(`board.first.${w}.sentence`),
  });
  return [way('type'), { ...way('text-to-graph'), ...(aiOff ? { off: aiOff } : {}) }, way('import')];
}

/** The graph a board builds: the one it is on, else one named after it that the note does not use yet. */
export function graphOfBoard(note: string, board: Board): string {
  if (board.on) return board.on;
  const base = board.name.endsWith('_board') ? board.name.slice(0, -'_board'.length) : `${board.name}_graph`;
  // the graph keeps its name when the note holds it already as a graph, so text goes on joining it
  if (readNote(gqlBlocks(note).map((b) => b.text)).graphs.has(base)) return base;
  return freeBoardName(note, base);
}

/**
 * The ask that sends text from a board to an AI to become a graph: text to graph (ES§47) for the graph the board
 * builds, ready for `prepareSend`, which keeps to the AI rules. `note` is the note as written, with or without the
 * board.
 */
export function boardTextAsk(
  base: Omit<SendAsk, 'question' | 'answers' | 'choice'>,
  boardText: string,
  text: string,
  asked = '',
): SendAsk | SendRefused {
  return textToGraphAsk(base, graphOfBoard(base.note, readBoard(boardText).board), text, asked);
}

/** The items placed in a frame of their own, right of everything on the board, under fresh names. */
export function framed(board: Board, title: string, items: readonly BoardItem[], connectors: readonly Connector[]) {
  const used = new Set([...board.items, ...(board.layers ?? [])].map((i) => i.id));
  const frameId = freeName('frame', used);
  used.add(frameId);
  const ids = new Map<string, string>();
  for (const i of items) {
    const id = freeName(i.id, used);
    used.add(id);
    ids.set(i.id, id);
  }
  const boxes = items.map(itemBox);
  const minX = Math.min(0, ...boxes.map((b) => b.x)),
    minY = Math.min(0, ...boxes.map((b) => b.y));
  const right = Math.max(0, ...boxes.map((b) => b.x + b.w)) - minX,
    bottom = Math.max(0, ...boxes.map((b) => b.y + b.h)) - minY;
  const there = board.items.map(itemBox);
  const x0 = there.length ? Math.max(...there.map((b) => b.x + b.w)) + GAP : 0;
  const y0 = there.length ? Math.min(...there.map((b) => b.y)) : 0;
  const frame: BoardItem = {
    id: frameId,
    kind: 'Frame',
    x: x0,
    y: y0,
    w: Math.round(right + 2 * ROOM),
    h: Math.round(bottom + 2 * ROOM),
    layer: -1,
    text: title,
    more: {},
  };
  const moved = items.map((i): BoardItem => {
    const more = { ...i.more };
    delete more.in_layer; // the layers of what came in are not brought with it
    return {
      ...i,
      id: ids.get(i.id) ?? i.id,
      x: Math.round(i.x - minX + x0 + ROOM),
      y: Math.round(i.y - minY + y0 + ROOM),
      more,
    };
  });
  const joined = connectors.flatMap((c) => {
    const [from, to] = [ids.get(c.from), ids.get(c.to)];
    return from && to ? [{ ...c, from, to }] : [];
  });
  return { frame, items: [frame, ...moved], connectors: joined };
}

/** The cards of things in a grid, each linked to its thing, with the name it goes by as its text. */
function cardsOf(things: readonly { key: string; name: string }[]): BoardItem[] {
  return things.map((t, n) => ({
    id: `card_${t.key}`,
    kind: 'Card',
    x: (n % ROW) * (CARD[0] + ROOM),
    y: Math.floor(n / ROW) * (CARD[1] + ROOM),
    w: CARD[0],
    h: CARD[1],
    text: t.name,
    graph: t.key,
    more: {},
  }));
}

/** The things and links a proposal adds to `graph`, read as the note would hold them once it is accepted. */
function addedBy(note: string, graph: string, proposal: Proposal) {
  const written = noteWithTextGraphApplied(note, proposal);
  if (typeof written !== 'string') return written;
  const g = readNote(gqlBlocks(written).map((b) => b.text)).world[graph];
  const before = readNote(gqlBlocks(note).map((b) => b.text)).world[graph];
  const had = new Set(before ? before.nodes.keys() : []);
  const keys = [...new Set(proposal.changes.flatMap((c) => namesOf(c).writes))].filter(
    (k) => !had.has(k) && !!g?.nodes.has(k),
  );
  const things = keys.map((key) => {
    const name = g?.p(key).name;
    return { key, name: typeof name === 'string' ? name : key };
  });
  const links = (g?.edges ?? [])
    .filter(([a, type, b]) => !before?.edges.some((e) => e[0] === a && e[1] === type && e[2] === b))
    .map(([from, type, to]) => ({ from, type, to }));
  return { written, things, links };
}

/** What a text graph puts on a board: its block as it would be, the new board, and the one change that makes it. */
export interface BoardGraphDraft {
  /** The board as it would be once accepted, to be drawn as a proposal; nothing is written. */
  board: Board;
  /** The one change that adds the frame of cards and connectors. */
  change: Extract<BoardChange, { kind: 'adds' }>;
  /** The things each new card stands for, by the card's name. */
  cards: Record<string, string>;
  said: string;
}

/**
 * A text graph's proposal drawn on a board: a frame of cards, one for each new thing and linked to it, with a
 * connector for each new link between them. It is for showing; nothing is written. The note is read as it is.
 */
export function boardGraphDraft(
  note: string,
  boardText: string,
  proposal: Proposal,
): BoardGraphDraft | { refused: string } {
  const { board } = readBoard(boardText);
  const graph = proposal.graph;
  if (board.on && board.on !== graph)
    return { refused: word('board.first.other-graph', { board: board.name, graph: board.on }) };
  const added = addedBy(note, graph, proposal);
  if ('refused' in added) return added;
  if (!added.things.length) return { refused: word('ai.text-graph.nothing-new') };
  const cards = cardsOf(added.things);
  const idOf = new Map(cards.map((c) => [c.graph ?? '', c.id]));
  // a link to a thing already on the board joins that item; one to a thing on no item is drawn by the graph alone
  for (const i of board.items) if (i.graph && !idOf.has(i.graph)) idOf.set(i.graph, `@${i.id}`);
  const connectors: Connector[] = added.links.flatMap((l) => {
    const [a, b] = [idOf.get(l.from), idOf.get(l.to)];
    return a && b && !a.startsWith('@') && !b.startsWith('@') ? [{ from: a, to: b, label: l.type }] : [];
  });
  const put = framed(board, word('board.first.frame-text', { graph }), cards, connectors);
  const change = { kind: 'adds' as const, items: put.items, connectors: put.connectors };
  const out: Board = {
    ...board,
    on: graph,
    items: [...board.items, ...put.items],
    connectors: [...board.connectors, ...put.connectors],
  };
  const named: Record<string, string> = {};
  for (const i of put.items) if (i.graph) named[i.id] = i.graph;
  const said = word('board.first.drafted', { things: added.things.length, links: put.connectors.length, graph });
  return { board: out, change, cards: named, said };
}

/** The note with the board named `name` written as `board`, its block added when the note holds none yet. */
function withBoard(note: string, name: string, board: Board): string {
  const span = gqlSpans(note).find((s) => boardOf(s.text)?.name === name);
  const text = writeBoard(board);
  return span ? replaceSpan(note, span, text).note : withStarter(note, text);
}

/** A change to a note that can be taken back in one step: the note before and after, what was said, and what was left out. */
export interface Imported {
  before: string;
  note: string;
  said: string;
  notes: string[];
}

/**
 * The note with a text graph's proposal accepted on its board: the changes ticked, by id, written to the graph block,
 * and their cards and connectors to the board, which is put on the graph. One change, taken back by one undo. A
 * board still to be written is written now. Refused, changing nothing, when any part cannot be written.
 */
export function boardGraphAccepted(
  note: string,
  boardText: string,
  proposal: Proposal,
  ticked: readonly string[] = proposal.changes.map((c) => c.id),
): Imported | { refused: string } {
  const kept = tickedOnly(proposal, ticked, note);
  if (!kept.changes.length) return { refused: word('board.first.none-ticked') };
  const draft = boardGraphDraft(note, boardText, kept);
  if ('refused' in draft) return draft;
  const written = noteWithTextGraphApplied(note, kept);
  if (typeof written !== 'string') return written;
  const name = readBoard(boardText).board.name;
  return { before: note, note: withBoard(written, name, draft.board), said: draft.said, notes: [] };
}

/** What can be brought onto a board to start a graph. */
export type Bringing =
  /** A JSON Canvas file or an Excalidraw drawing, by its path and text. */
  | { file: { path: string; text: string } }
  /** A board already read from a deck (board-pptx.ts), with its title and sentences of what was left out. */
  | { deck: { board: Board; title: string; notes: string[] } }
  /** Another note's graph, by the note's link and text, read there and never copied. */
  | { graph: { link: string; note: string; graph?: string } };

/** The things of a graph of a note, each with the name it goes by. */
function thingsOf(note: string, graph: string) {
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const g = reading.world[graph];
  if (!g) return null;
  return [...g.nodes.keys()].map((key) => {
    const name = g.p(key).name;
    return { key, name: typeof name === 'string' ? name : key };
  });
}

/**
 * The note with something brought onto its board `boardText`, in a frame of its own on clear space; or why it cannot
 * be, changing nothing. A board still to be written is written now. Another note's graph comes as live cards: a block
 * that reads the graph from that note (`FROM [[note]]`), and a card linked to each of its things.
 */
export function importOnBoard(note: string, boardText: string, what: Bringing): Imported | { refused: string } {
  const { board } = readBoard(boardText);
  if ('graph' in what) return graphBrought(note, board, what.graph);
  let read: { board: Board; title: string; notes: string[] };
  if ('file' in what) {
    const made = boardFileBlock('brought', what.file.path, what.file.text);
    if ('refused' in made) return made;
    const inner = made.block.replace(/^```gql\n|\n```$/g, '');
    read = { board: readBoard(inner).board, title: what.file.path.replace(/^.*\//, ''), notes: made.notes };
  } else read = what.deck;
  if (!read.board.items.length) return { refused: word('board.first.nothing-in', { file: read.title }) };
  const put = framed(board, read.title, read.board.items, read.board.connectors);
  const out: Board = {
    ...board,
    items: [...board.items, ...put.items],
    connectors: [...board.connectors, ...put.connectors],
  };
  const said = word('board.first.brought', { what: read.title, items: put.items.length - 1 });
  return { before: note, note: withBoard(note, board.name, out), said, notes: read.notes };
}

/** Another note's graph brought onto a board as live cards, read from that note. */
function graphBrought(note: string, board: Board, from: { link: string; note: string; graph?: string }) {
  const graph = from.graph ?? [...readNote(gqlBlocks(from.note).map((b) => b.text)).graphs.keys()][0];
  if (!graph) return { refused: word('board.first.no-graph-there', { note: from.link }) };
  const things = thingsOf(from.note, graph);
  if (!things?.length) return { refused: word('board.first.no-graph-there', { note: from.link }) };
  if (board.on && board.on !== graph)
    return { refused: word('board.first.other-graph', { board: board.name, graph: board.on }) };
  const head = `// graph: ${graph} · FROM [[${from.link}]]`;
  const blocks = gqlBlocks(note).map((b) => b.text);
  const sourced = blocks.some((t) => t.split('\n')[0]?.trim() === head);
  if (!sourced && (readNote(blocks).graphs.has(graph) || blocks.some((t) => boardOf(t)?.name === graph)))
    return { refused: word('board.first.graph-taken', { graph }) };
  const put = framed(board, from.link, cardsOf(things), []);
  const out: Board = { ...board, on: graph, items: [...board.items, ...put.items] };
  const body = note.trimEnd();
  const withSource = sourced ? note : `${body}${body ? '\n\n' : ''}\`\`\`gql\n${head}\n\`\`\`\n`;
  const said = word('board.first.brought', { what: from.link, items: things.length });
  return { before: note, note: withBoard(withSource, board.name, out), said, notes: [] };
}

/** The note as it was before `made`, in one step; refused while the note has been changed since, so nothing is lost. */
export function undoImport(now: string, made: Imported): { note: string } | { refused: string } {
  return now === made.note ? { note: made.before } : { refused: word('board.first.changed-since') };
}
