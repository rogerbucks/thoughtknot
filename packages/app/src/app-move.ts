// Moving the notes to another folder from the desktop app (spec §55, storage_user_choice). The person picks the folder.
// Every note is copied there and read back, by the core's checked move. If a check fails, nothing is moved and the new
// folder is left as it was found. Only once all is checked does the app open the new folder. The old copies stay where
// they were until the person presses Remove, and a note changed since the move is kept. GitHub is not a place notes are
// moved to: a note goes there only through the reviewed send (app-github.ts).
import { letGoOfOld, moveNotes, word } from '@thoughtknot/core';
import type { MovedNote, WordKey } from '@thoughtknot/core';
import { tauriStorage, type Invoke } from './tauri-files.ts';

/** What the move needs: the page, the app's commands, and how to show the open folder again under its new name. */
export interface MoveOptions {
  doc: Document;
  invoke: Invoke;
  /** The name of the folder open now, which the notes are moved from. */
  from: string;
  /** Lists the open folder again, by its name, once the notes are moved. */
  reopen: (folder: string) => Promise<void>;
  /** Where the move says what it is doing and what it did. */
  say: (text: string) => HTMLElement;
}

/** The button that moves the notes to another folder. */
export function moveButton(o: MoveOptions): HTMLButtonElement {
  const button = Object.assign(o.doc.createElement('button'), { type: 'button', textContent: word('app.move') });
  button.addEventListener('click', () => void moveNotesTo(o));
  return button;
}

/** Picks a folder and moves every note to it, checked; then offers to remove the old copies. */
export async function moveNotesTo(o: MoveOptions): Promise<void> {
  const { invoke, say } = o;
  let folder: string | null;
  try {
    folder = (await invoke('pick_target')) as string | null;
  } catch (e) {
    say(word('app.move.cannot', { why: e instanceof Error ? e.message : String(e) }));
    return;
  }
  if (folder === null) return;
  say(word('app.move.copying', { folder }));
  const done = await moveNotes(tauriStorage(invoke), tauriStorage(invoke, { target: true })).catch((e: unknown) => ({
    ok: false as const,
    why: e instanceof Error ? e.message : String(e),
  }));
  if (!done.ok) {
    say(
      'why' in done
        ? word('app.move.cannot', { why: done.why })
        : word(`app.move.${done.reason === 'same' ? 'copy' : done.reason}` as WordKey, {
            folder,
            paths: done.paths.join(', '),
          }),
    );
    return;
  }
  // the old folder becomes the target: its copies can be removed from there, and only from there
  const now = (await invoke('swap_folders')) as string;
  await o.reopen(now);
  offerLetGo(o, done.moved, now);
}

/** Says where the notes are now, and offers to remove the old copies or keep them. */
function offerLetGo(o: MoveOptions, moved: MovedNote[], folder: string): void {
  const { doc, invoke, say } = o;
  const old = o.from;
  const said = say(word('app.move.done', { count: moved.length, folder, old }));
  const remove = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.move.let-go') });
  const keep = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.move.keep') });
  said.append(' ', remove, ' ', keep);
  const close = () => [remove, keep].forEach((b) => b.remove());
  keep.addEventListener('click', close);
  remove.addEventListener('click', () => {
    close();
    void letGoOfOld(tauriStorage(invoke, { target: true }), moved).then((gone) => {
      say(word('app.move.removed', { count: gone.removed.length, old }));
      if (gone.kept.length) say(word('app.move.kept', { old, paths: gone.kept.join(', ') }));
    });
  });
}
