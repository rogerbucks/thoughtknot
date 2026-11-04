// Writing a card's style graph into its note (editor spec §6, §68 move_undo). A style change is written through the
// note's editor where it is open, else into the file, and confirmed in words. The last one written to each note is
// kept. So the card's Undo can take it back, while the note is still as that write left it.
import { styleEdit, word } from '@thoughtknot/core';
import type { GraphDrawing, NudgeWrite, StyleChange, StyleGraph } from '@thoughtknot/core';
import type { BoxMoving } from '@thoughtknot/core/display/graph-view/box-drag-view';
import { Notice, TFile } from 'obsidian';
import type ThoughtKnotPlugin from './main';
import { changeVaultNote } from './storage/plugin-notes';
import { replaceInEditor } from './block-editor/note-writing';

/** Writes a change to the style graph of `graph` into the note at `path`, against the note as it is when written. */
export async function writeStyle(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  change: StyleChange,
  done: string,
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  let refused = '';
  const written: { before?: string; after?: string } = {};
  // a thing only suggested in the note as it is now is not styled until its name is written (§4)
  const edit = (note: string) => {
    const r = styleEdit(note, graph, change);
    if ('refused' in r) refused = r.refused;
    const next = 'note' in r ? r.note : note;
    Object.assign(written, { before: note, after: next });
    return next;
  };
  // a note open in the editing view is changed through its editor, so one Cmd+Z takes the change back (UX-5)
  const cm = plugin.editorFor(file.path);
  if (cm) {
    const now = cm.state.doc.toString(),
      next = edit(now);
    if (next !== now) replaceInEditor(cm, next);
  } else await changeVaultNote(plugin.app, file.path, edit);
  // kept, so the card's Undo can take it back (move_undo)
  if (written.before !== undefined && written.after !== undefined && written.before !== written.after)
    lastStyle.set(path, { before: written.before, after: written.after });
  // each write is confirmed in words, as is each refusal
  new Notice(refused ? word('blocks.style-failed', { why: refused }) : done);
}

/** The last style written to each note, before and after, for its card's Undo (move_undo). */
const lastStyle = new Map<string, { before: string; after: string }>();

/**
 * Takes the last style written to note `path` back (move_undo), only while the note is still as that write left it.
 * Else nothing is changed. Through its editor where it is open, as it was written.
 */
export async function undoStyle(plugin: ThoughtKnotPlugin, path: string): Promise<void> {
  const last = lastStyle.get(path);
  lastStyle.delete(path);
  if (!last) return;
  const cm = plugin.editorFor(path);
  if (cm) {
    if (cm.state.doc.toString() === last.after) replaceInEditor(cm, last.before);
  } else await changeVaultNote(plugin.app, path, (note) => (note === last.after ? last.before : note));
  new Notice(word('move.undone'));
}

/**
 * How a card's boxes are moved (§6, drag_moves_box). Each place is written as a nudge in the style graph. The card's
 * Undo takes the last one back (move_undo). In a radial drawing, its centre is kept (radial_spoke_order).
 */
export function movingFor(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  styling: { style: StyleGraph },
  drawing: GraphDrawing,
): BoxMoving {
  return {
    written: styling.style.nudges,
    ...(drawing.diagram?.type === 'radial' ? { centre: drawing.diagram.centre } : {}),
    move: (nudge: NudgeWrite, done: string) => void writeStyle(plugin, path, graph, { nudge }, done),
    undo: () => void undoStyle(plugin, path),
  };
}
