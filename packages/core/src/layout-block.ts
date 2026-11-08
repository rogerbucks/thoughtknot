// Where things sit on screen, kept apart from the data (editor spec §2, layout_block; Roger, 7 Nov 2026, R16). The
// places a person gives things, and the group each is shown in, are a block of their own after the graph:
// `// graph: trip_layout · LAYOUT ON trip`. Each line places one thing, named by its key in the graph:
//   (ann:Place {x: 120, y: 40, group: 'Team'})
// The graph block is never rewritten to save a layout. Deleting this block loses only where things sat
// (layout_block_optional). A place for a thing the graph no longer holds is a problem whose fix forgets it
// (layout_block_checked). It is read with the board's reader (board.ts), with one kind.
//
// Host-free and pure: each writer takes the block's text and gives the new text, one edit that one undo takes back.
import { layoutOf } from './blocks.ts';
import { itemGql, readItems } from './board.ts';
import type { BoardItem } from './board.ts';
import type { Problem } from './note-reading.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

export { layoutOf };

/** Where one thing sits, and the group it is shown in, if a person chose one. */
export interface Place {
  x: number;
  y: number;
  group?: string;
}

/** The layout of one graph. */
export interface Layout {
  name: string;
  /** The graph it places. */
  on: string;
  /** Each thing's place, by its key in the graph, in the order written. */
  places: Map<string, Place>;
}

const KINDS = new Set(['Place']);

/**
 * The places a layout block holds, with their problems. `things` are the keys of the graph's things. A place for any
 * other is a problem, and is not given, so it is never drawn; with no `things`, none is checked. `block` is the
 * block's place in the note, for the problems. Whatever can be read is kept; nothing is written to the note.
 */
export function readLayout(text: string, things?: Set<string>, block = 0): { layout: Layout; problems: Problem[] } {
  const line = layoutOf(text);
  const read = readItems(
    text,
    line,
    KINDS,
    (kind, id) => ({
      code: 'GN909',
      message: word('layout.kind-unknown', { kind, id }),
      fix: word('layout.kind-unknown.fix'),
    }),
    undefined,
    block,
  );
  const layout: Layout = { name: line?.name ?? '', on: line?.on ?? '', places: new Map() };
  const problems = read.problems;
  const lineOf = new Map<string, number>();
  for (const w of writtenIn(text))
    if (w.writes && w.variable && !lineOf.has(w.variable.name))
      lineOf.set(w.variable.name, text.slice(0, w.open).split('\n').length);
  for (const it of read.board.items) {
    if (things && !things.has(it.id)) {
      problems.push({
        graph: layout.name,
        block,
        line: lineOf.get(it.id) ?? 1,
        severity: 'error',
        code: 'GN910',
        message: word('layout.thing-gone', { thing: it.id, graph: layout.on }),
        fix: word('layout.thing-gone.fix', { thing: it.id }),
      });
      continue;
    }
    // the board's reader keeps a group as its own field
    const group = it.group;
    layout.places.set(it.id, { x: it.x, y: it.y, ...(group !== undefined && { group }) });
  }
  problems.sort((a, b) => a.line - b.line);
  return { layout, problems };
}

/** One place written as GQL, in the one fixed form. */
function placeGql(thing: string, place: Place): string {
  const item: BoardItem = { id: thing, kind: 'Place' as BoardItem['kind'], x: place.x, y: place.y, more: {} };
  if (place.group !== undefined) item.group = place.group;
  return itemGql(item);
}

/** A layout written as its block, in the one fixed form: the graph line, then each place on a line. */
export function writeLayout(layout: Layout): string {
  const lines = [...layout.places].map(([thing, place]) => placeGql(thing, place));
  return [
    `// graph: ${layout.name} · LAYOUT ON ${layout.on}`,
    ...lines.map((l, i) => (i < lines.length - 1 ? `${l},` : l)),
  ].join('\n');
}

/** The name a new layout block gets: the graph's name and `_layout`. */
export const layoutName = (graph: string): string => `${graph}_layout`;

/**
 * The block with one thing placed, its place rounded to whole numbers (layout_drag_saves). With no block yet (`text`
 * null), a new one is made for `graph`. A thing already placed has only its own line rewritten. It keeps its group
 * unless one is given. Every other line, its notes and comments too, stays as it was. A new place is added at the end.
 */
export function placeThing(text: string | null, graph: string, thing: string, x: number, y: number, group?: string) {
  const at = { x: Math.round(x), y: Math.round(y) };
  if (text === null || !layoutOf(text)) {
    const fresh: Layout = { name: layoutName(graph), on: graph, places: new Map() };
    fresh.places.set(thing, { ...at, ...(group !== undefined && { group }) });
    return writeLayout(fresh);
  }
  const was = readLayout(text).layout.places.get(thing);
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === thing);
  const keep = group ?? was?.group;
  const line = placeGql(thing, { ...at, ...(keep !== undefined && { group: keep }) });
  if (was && w) return text.slice(0, w.open) + line + text.slice(w.close + 1);
  const body = text.trimEnd();
  return readLayout(text).layout.places.size ? `${body},\n${line}` : `${body}\n${line}`;
}

/**
 * The block without the place of `thing`: the fix of a place for a thing that is gone. Its line goes, and the comma
 * of the line before it when it was the last. A block that does not place it is given back as it was.
 */
export function forgetPlace(text: string, thing: string): string {
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === thing);
  if (!w) return text;
  const lines = text.split('\n');
  const at = text.slice(0, w.open).split('\n').length - 1;
  lines.splice(at, 1);
  // the last place now ends without a comma
  for (let i = lines.length - 1; i > 0; i--) {
    const l = lines[i] ?? '';
    if (!l.trim() || l.trim().startsWith('//')) continue;
    const kept = l.trimEnd();
    lines[i] = kept.endsWith(',') ? kept.slice(0, -1) : l;
    break;
  }
  return lines.join('\n');
}

/**
 * The block with a thing renamed (layout_block_checked, as rename_carries_nudges): its place is carried to the new
 * name in the same step. A block that does not place it is given back as it was.
 */
export function renamePlace(text: string, from: string, to: string): string {
  const w = writtenIn(text).find((t) => t.writes && t.variable?.name === from);
  const was = readLayout(text).layout.places.get(from);
  if (!w || !was) return text;
  return text.slice(0, w.open) + placeGql(to, was) + text.slice(w.close + 1);
}
