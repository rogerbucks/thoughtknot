// The places people gave things by dragging, read from and saved to a note's layout block (editor spec, ES§2,
// layout_drag_saves; Roger, 7 Nov 2026, R16). A drag saves one place, in Reading view too. The graph block is never
// rewritten, and nothing else moves (nodes stay put). Host-free and pure: the host reads the note, calls this, and
// writes what it gives back in one step.
import { gqlSpans, layoutOf } from './blocks.ts';
import { forgetPlace, placeThing, readLayout, saveCard, type CardSave, type Place } from './layout-block.ts';
import { metadataWrite } from './metadata-write.ts';

/** The layout block of `graph` in `note`, as written, if it has one. */
const layoutText = (note: string, graph: string): string | null =>
  gqlSpans(note).find((s) => layoutOf(s.text)?.on === graph)?.text ?? null;

/** The places saved for `graph`'s things in `note`, by key. A place for a thing not in `things` is left out. */
export function savedPlaces(note: string, graph: string, things?: Set<string>): Map<string, Place> {
  const text = layoutText(note, graph);
  return text === null ? new Map<string, Place>() : readLayout(text, things).layout.places;
}

/**
 * The note with `thing` of `graph` saved at `x`, `y`, or why not. `shown` is the graph block's text as the person saw
 * it: when the note holds another now, nothing is written. The layout block is made after the graph when there is none.
 */
export function placeInNote(
  note: string,
  graph: string,
  shown: string,
  thing: string,
  x: number,
  y: number,
): { text: string } | { refused: string } {
  return metadataWrite(note, graph, 'LAYOUT', placeThing(layoutText(note, graph), graph, thing, x, y), shown);
}

/** The note with the place of `thing` of `graph` forgotten, or why not: the undo of its first place (layout_drag_saves). */
export function forgetInNote(
  note: string,
  graph: string,
  shown: string,
  thing: string,
): { text: string } | { refused: string } {
  const text = layoutText(note, graph);
  if (text === null) return { text: note };
  return metadataWrite(note, graph, 'LAYOUT', forgetPlace(text, thing), shown);
}

/** How the cards of `graph`'s things in `note` were sized and put, by key (render_cards, layout_block). */
export function savedCards(note: string, graph: string, things?: Set<string>): Map<string, CardSave> {
  const text = layoutText(note, graph);
  return (text === null ? undefined : readLayout(text, things).layout.cards) ?? new Map<string, CardSave>();
}

/** The note with `thing`'s card of `graph` saved as `c`, or forgotten with none; or why not, as `placeInNote`. */
export function cardInNote(
  note: string,
  graph: string,
  shown: string,
  thing: string,
  c: CardSave | null,
): { text: string } | { refused: string } {
  const text = saveCard(layoutText(note, graph), graph, thing, c);
  return text === null ? { text: note } : metadataWrite(note, graph, 'LAYOUT', text, shown);
}
