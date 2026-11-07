// Metadata written from Reading view (editor spec §3, reading_view_metadata and reading_view_metadata_safe; Roger, 7 Nov
// 2026). Obsidian's own Reading view lets a person change a property or tick a task. So the plugin may write a note's
// properties, its layout block and its AI block there, and nothing else:
// - a block goes through the vault's note storage (storage/plugin-notes.ts), against the note as it is then, so nothing
//   written in between is lost;
// - a property goes through FileManager.processFrontMatter, Obsidian's own writer of front matter;
// - each gives back the words to show and an undo that takes back exactly that write, or refuses when the note moved on.
// It shows nothing itself: the caller shows the words, as a toast with Undo.
import { metadataWrite, word } from '@thoughtknot/core';
import type { ChangeOutcome, MetaKind, NoteEdit } from '@thoughtknot/core';
import type { App, TFile } from 'obsidian';
import { changeVaultNote } from './storage/plugin-notes.ts';

/** What a write did: the words to show, and, when it wrote, how to take it back. */
export interface MetaWritten {
  said: string;
  undo?: () => Promise<string>;
}

/** Changes one note by an edit, against the note as it is then. */
export type NoteChanger = (edit: NoteEdit) => Promise<ChangeOutcome>;

/** The changer of one note of the vault, through its note storage. */
export const vaultChanger =
  (app: App, file: TFile): NoteChanger =>
  (edit) =>
    changeVaultNote(app, file.path, edit);

/**
 * Writes the metadata block of `kind` for `graph` as `block`, in one step from a fresh read. `shown` is the graph as the
 * person saw it: when the note holds another graph now, nothing is written and the words say why.
 */
export async function writeMetaBlock(
  change: NoteChanger,
  graph: string,
  kind: MetaKind,
  block: string,
  shown: string,
): Promise<MetaWritten> {
  let refused: string | null = null,
    before = '',
    after = '';
  const done = await change((fresh) => {
    const r = metadataWrite(fresh, graph, kind, block, shown);
    if ('refused' in r) {
      refused = r.refused;
      return fresh;
    }
    before = fresh;
    after = r.text;
    return r.text;
  });
  if (refused !== null) return { said: refused };
  if (!done.ok) return { said: done.reason };
  const undo = async () => {
    let moved = false;
    const back = await change((now) => {
      moved = now !== after;
      return moved ? now : before;
    });
    if (!back.ok) return back.reason;
    return word(moved ? 'meta.undo-moved' : 'meta.undone');
  };
  return { said: word('meta.saved'), undo };
}

/** Sets one property of the note, through Obsidian's own front matter writer; its undo puts back what was there. */
export async function writeProperty(
  { fileManager }: Pick<App, 'fileManager'>,
  file: TFile,
  key: string,
  value: unknown,
): Promise<MetaWritten> {
  let had = false,
    was: unknown,
    set: unknown;
  await fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    had = Object.hasOwn(fm, key);
    was = fm[key];
    fm[key] = value;
    set = value;
  });
  const undo = async () => {
    let moved = false;
    await fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (fm[key] !== set) {
        moved = true;
        return;
      }
      if (had) fm[key] = was;
      else delete fm[key];
    });
    return word(moved ? 'meta.undo-moved' : 'meta.undone');
  };
  return { said: word('meta.saved'), undo };
}
