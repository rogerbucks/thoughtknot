// The edit pane on the page (spec §4, §26; cc_editor_opens, cc_core_only). It is the display layer's block editor, the
// one the Obsidian pane runs, opened on the page's note.
// These are all the layer's:
// - its text field over the coloured picture, and the problems with their fixes;
// - suggestions, Undo, Redo and Lock the graph;
// - the picker of the note's graph blocks, and the draft banner;
// - the drawing beside it, with its details and its quick fixes.
// These are the page's: the note behind it (page-note.ts), the settings it reads by, and the layout worker.
// The drawing is laid out in that worker, in the host's own colours. The page's theme names them (theme-css.ts). So the
// drawing follows the system's scheme with no redraw. A graph too large to lay out is its overview, in the same colours.
// A filter chosen on it is saved in the note's style block, as the pane is where the note is edited (scale_filter_live).
// A block too large to read at once reads its saved filter from the note's whole text.
// The bar says whether the graph's picture for readers is up to date, as the server reads it (§62). It asks again now
// and then. The picture may be kept from Obsidian or the command line.
import { PALETTES, shownAsRead, styleEdit } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';
import { notice } from '@thoughtknot/core/display/host';
import { BlockEditor } from '@thoughtknot/core/display/editor/block-editor';
import { directed } from '@thoughtknot/core/display/editor/pane-drawing';
import type { PaneHost } from '@thoughtknot/core/display/editor/pane-drawing';
import type { LayoutRunner } from '@thoughtknot/core';
import type { PageNote } from './page-note.ts';
import type { PictureStates } from '../src/api-types.ts';
import type { PictureStatus } from '@thoughtknot/core/display/graph-view/view-options';
import { word } from '@thoughtknot/core';

/** How often the bar asks again whether a picture is up to date, in milliseconds. */
export const PICTURE_ASK_EVERY = 15_000;

/** Whether `graph`'s picture is up to date, by the server's `pictures`; a call that fails says nothing. */
export function pagePicture(pictures: () => Promise<PictureStates>, graph: string): PictureStatus {
  return {
    state: async () => (await pictures().catch((): PictureStates => ({})))[graph] ?? null,
    watch: (then) => {
      // a timeout set again each time, as the page starts nothing that repeats on its own (cc_reduced_motion)
      let next = 0;
      const ask = () => {
        next = window.setTimeout(() => (then(), ask()), PICTURE_ASK_EVERY);
      };
      ask();
      return () => window.clearTimeout(next);
    },
  };
}

/**
 * The pane's host: the settings as they are, read only, and a graph laid out by the page's worker under the core's
 * limits. With `note`, a filter chosen on an overview is written into it, and the page says whether it was. With
 * `pictures`, the bar says whether each picture is up to date.
 */
export function paneHost(
  settings: Settings,
  layouts: LayoutRunner,
  note?: PageNote,
  pictures?: () => Promise<PictureStates>,
): PaneHost {
  return {
    settings: () => settings,
    layout: (drawing, owner) => layouts.draw(directed(drawing, settings.direction), owner).then(shownAsRead),
    palette: PALETTES.system,
    again: () => layouts.resume(),
    ...(pictures && { picture: (graph: string) => pagePicture(pictures, graph) }),
    ...(note && {
      noteText: () => note.text,
      saveFilter: (graph, keep) => {
        const r = styleEdit(note.text, graph, { filter: { keep } });
        if ('refused' in r) return notice(r.refused);
        void note.writeWhole(r.note).then((w) => notice(w.ok ? word('massive.filter-saved') : w.why));
      },
    }),
  };
}

/**
 * The block editor opened on `note` in `into`, loaded and ready. It opens the note's first graph block. When the note
 * has no graph, it opens none, and the pane says so in words. The caller unloads it to stop it.
 */
export async function openEditorPane(
  into: HTMLElement,
  note: PageNote,
  settings: Settings,
  layouts: LayoutRunner,
  pictures?: () => Promise<PictureStates>,
): Promise<BlockEditor> {
  const editor = new BlockEditor(paneHost(settings, layouts, note, pictures), 'pane', note);
  editor.load();
  editor.mount(into);
  await editor.open('', -1);
  return editor;
}
