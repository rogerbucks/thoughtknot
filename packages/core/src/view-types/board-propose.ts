// A whole board proposed (editor spec §45, board_proposed). A board of views is offered from a graph here, or by an AI
// the person asked in plain words (board-ask.ts). It is a proposal only: it is shown, and written to the note only when
// the person keeps it. Every item cites what it came from. Where each item goes is worked out here, never by an AI.
// Host-free and pure. It lives with the view types, whose drawing it reads, and reaches nothing that sends to an AI.
import type { BoardDraft } from '../ai-request.ts';
import { gqlBlocks } from '../blocks.ts';
import { writeBoard, type BoardItem } from '../board.ts';
import { freeBoardName } from '../board-list.ts';
import { readNote } from '../drawing.ts';
import { shapeOf } from '../types-shape.ts';
import { word } from '../words.ts';

export type { BoardDraft };

/** One part of a proposed board, before it has a place: a view of the graph or a note, with what it rests on. */
export interface DraftPart {
  view?: string;
  note?: string;
  /** The frame it sits in, by its title; none, it sits free. */
  frame?: string;
  /** What it came from, in words. */
  cites: string;
}

/** The most parts one proposed board holds. */
export const DRAFT_MOST = 24;
/** The size of a view and of a note on a proposed board, the gap between two, and the room a frame leaves round. */
const VIEW = [480, 360] as const,
  NOTE = [220, 160] as const,
  GAP = 40,
  ROOM = 40;

/**
 * The board `parts` make, named `name` on `graph`. Parts with the same frame sit together in it, two to a row. The
 * frames stand side by side in the order first named, with the free parts first. Nothing overlaps.
 */
export function draftOf(name: string, graph: string, parts: readonly DraftPart[]): BoardDraft {
  const groups = new Map<string, DraftPart[]>();
  for (const p of parts) groups.set(p.frame ?? '', [...(groups.get(p.frame ?? '') ?? []), p]);
  const order = [...groups.keys()].sort((a, b) => Number(a !== '') - Number(b !== ''));
  const items: BoardItem[] = [];
  const cites: BoardDraft['cites'] = [];
  const count = { view: 0, note: 0, frame: 0 };
  let left = 0;
  for (const title of order) {
    const pad = title ? ROOM : 0;
    let y = pad,
      wide = 0;
    const row: BoardItem[] = [];
    const made: BoardItem[] = [];
    let x = left + pad,
      tall = 0;
    for (const p of groups.get(title) ?? []) {
      const [w, h] = p.view ? VIEW : NOTE;
      if (row.length === 2) {
        y += tall + GAP;
        x = left + pad;
        tall = 0;
        row.length = 0;
      }
      const id = p.view ? `view${(count.view += 1)}` : `note${(count.note += 1)}`;
      const more: BoardItem['more'] = p.view ? { view: p.view, of: graph, cites: p.cites } : { cites: p.cites };
      const item: BoardItem = { id, kind: p.view ? 'View' : 'Sticky', x, y, w, h, more };
      if (p.note) item.text = p.note;
      made.push(item);
      row.push(item);
      cites.push({ id, said: p.cites });
      x += w + GAP;
      tall = Math.max(tall, h);
      wide = Math.max(wide, x - GAP - left + pad);
    }
    if (title) {
      const frame: BoardItem = { id: `frame${(count.frame += 1)}`, kind: 'Frame', x: left, y: 0, more: {} };
      items.push({ ...frame, w: wide, h: y + tall + pad, text: title, layer: -1 });
    }
    items.push(...made);
    left += wide + GAP;
  }
  return { name, on: graph, text: writeBoard({ name, on: graph, items, connectors: [] }), cites };
}

/**
 * A board proposed from the graph `graph` of the note, with no AI. It holds the views that suit the graph, and a note
 * that says what was counted. Each cites the graph. Refused, in words, when the note has no such graph or it is empty.
 */
export function boardFromGraph(note: string, graph: string): BoardDraft | { refused: string } {
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const drawn = reading.graphs.get(graph);
  if (!drawn || !drawn.boxes.length) return { refused: word('board.view.empty', { graph }) };
  const shape = shapeOf(drawn, reading.world[graph]);
  const kinds = [...new Set(shape.things.flatMap((t) => t.kinds))].sort();
  const cites = word('board.propose.from-graph', { graph });
  const frame = word('board.propose.frame', { graph });
  const views = ['force', 'matrix', ...(kinds.length > 1 ? ['treemap'] : [])];
  const counted = word('board.propose.counted', {
    graph,
    things: shape.things.length,
    links: shape.links.length,
    kinds: kinds.length ? kinds.join(', ') : '-',
  });
  return draftOf(freeBoardName(note, `${graph}_views`), graph, [
    ...views.map((view) => ({ view, frame, cites })),
    { note: counted, cites },
  ]);
}

/** The note with a proposed board kept: its block written at the end, under a name nothing in the note has. */
export function withBoardKept(note: string, draft: BoardDraft): { note: string; name: string } {
  const name = freeBoardName(note, draft.name);
  const lines = draft.text.split('\n');
  const text = [`// graph: ${name} · BOARD ON ${draft.on}`, ...lines.slice(1)].join('\n');
  const body = note.trimEnd();
  return { note: `${body}${body ? '\n\n' : ''}\`\`\`gql\n${text}\n\`\`\`\n`, name };
}
