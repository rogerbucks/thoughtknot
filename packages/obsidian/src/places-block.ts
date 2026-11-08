// The places people drag things to on the new rendering, saved in Obsidian (ES§2, layout_drag_saves; Roger,
// 7 Nov 2026, R16). Each is written to the note's layout block, in Reading view too, against the note as it is then.
// The graph block is never rewritten. When the graph changed since it was drawn, nothing is written, and a notice
// says why. Each place offers its undo, which forgets a first place or puts back the one before.
import { Notice } from 'obsidian';
import { forgetInNote, placeInNote, savedPlaces } from '@thoughtknot/core';
import type { PlacesHost } from '@thoughtknot/core/display/graph-view/stage-places';
import type ThoughtKnotPlugin from './main';
import { changeVaultNote } from './storage/plugin-notes';

/**
 * The places saved for `graph` in `note`, and how a drag saves one. `shown` is the graph block's text as drawn.
 * Without the note's text, as when another plugin draws the block, places are shown but none is saved.
 */
export function placesFor(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  shown: string,
  note?: string,
): PlacesHost {
  const saved = note === undefined ? new Map() : savedPlaces(note, graph);
  if (note === undefined) return { saved };
  // one write of the note, against it as it is then; a refusal is said, and given back for the undo's toast
  const write = async (edit: (now: string) => { text: string } | { refused: string }): Promise<string | null> => {
    let refused: string | null = null;
    await changeVaultNote(plugin.app, path, (now) => {
      const r = edit(now);
      if ('text' in r) return r.text;
      refused = r.refused;
      return now;
    });
    if (refused) new Notice(refused);
    return refused;
  };
  return {
    saved,
    graph,
    place: (key, x, y) => write((now) => placeInNote(now, graph, shown, key, x, y)),
    forget: (key) => write((now) => forgetInNote(now, graph, shown, key)),
  };
}
