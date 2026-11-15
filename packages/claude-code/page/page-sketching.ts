// Drawings over a graph on the page (editor spec §70). It is the page VS Code's tab and the apps run too.
// The pane draws the note's drawings and the board layers that lie over the graph (board_layers_over).
// A drawing made there goes through the page's own version-checked write.
import { layersOver, PALETTES, sketchEdit, sketchInNote } from '@thoughtknot/core';
import type { SketchChange } from '@thoughtknot/core';
import type { SketchHost } from '@thoughtknot/core/display/graph-view/sketch-tool';

/** The page's note as the drawings need it: its text now, and its write against the version the page last saw. */
export interface SketchNote {
  readonly text: string;
  writeWhole(text: string): Promise<{ ok: true } | { ok: false; why: string }>;
}

/**
 * The drawings over `graph` as `note` holds them now, the board layers over it, and how to change the drawings.
 * They are drawn in the page's fixed colours, light or `dark`, as its boards are.
 */
export function pageSketching(note: SketchNote, graph: string, dark = false): SketchHost {
  return {
    sketch: sketchInNote(note.text, graph)?.sketch ?? null,
    over: layersOver(note.text, graph),
    palette: dark ? PALETTES.dark : PALETTES.light,
    write: async (change: SketchChange) => {
      const r = sketchEdit(note.text, graph, change);
      if ('refused' in r) return r;
      const w = await note.writeWhole(r.note);
      if (!w.ok) return { refused: w.why };
      return { sketch: sketchInNote(r.note, graph)?.sketch ?? { name: '', on: graph, items: [] } };
    },
  };
}
