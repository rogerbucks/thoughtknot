// Where the user's graphs are kept, by their choice (editor spec §55, ST1). The places on offer are the backends of the
// one storage interface (note-storage.ts) that pass its contract suite (storage-contract.ts). With no choice made, notes
// stay where the host already keeps them, such as the Obsidian vault (storage_defaults, Roger's D2). Every other place
// is opt in. A move copies every note and checks the copy before the old place is let go (storage_user_choice). Nothing
// is written to a place the user did not choose: a move that fails takes back what it wrote.
import type { NoteStorage, StoredNote } from './note-storage.ts';
import { storageContract } from './storage-contract.ts';

/** A place the user may keep their graphs. */
export interface StorageChoice {
  /** Its name in the setting: a lower-case word, such as `vault`, `folder` or `github`. */
  name: string;
  /** Its name as the user reads it. */
  title: string;
  /** The store of the notes kept there. Opened only once it is chosen, or a move to it is asked for. */
  open: () => NoteStorage | Promise<NoteStorage>;
  /** True when its own code passes the contract suite in this repository's tests, as the hosts' own backends do. */
  checked?: boolean;
  /**
   * A fresh, empty, throwaway store of the same kind, for a backend a plug-in adds. The contract suite runs on it, never
   * on the user's notes, and the place is offered only when every check passes.
   */
  trial?: () => NoteStorage | Promise<NoteStorage>;
}

/** The user's choice. `null`: no choice made, so the host's own place. */
export interface StorageSetting {
  /** Where the current copy of each note is kept. */
  where: string | null;
  /** Where the history of changes is kept, chosen apart from the notes (storage_history_layer). */
  history: string | null;
}

/** No choice made: notes and their history stay where the host keeps them. */
export const NO_CHOICE: StorageSetting = { where: null, history: null };

const NAME = /^[a-z][a-z0-9-]*$/;

/** The setting in what was saved; anything not understood is no choice, so the host's own place. */
export function storageSettingFrom(saved: unknown): StorageSetting {
  const o = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const name = (v: unknown) => (typeof v === 'string' && NAME.test(v) ? v : null);
  return { where: name(o.where), history: name(o.history) };
}

/** Whether every check of the contract passes on a store from `make`. */
async function passes(make: () => NoteStorage | Promise<NoteStorage>): Promise<boolean> {
  try {
    for (const check of storageContract(make)) await check.run();
    return true;
  } catch {
    return false;
  }
}

/**
 * The places the setting offers: each one checked by this repository's tests, or whose trial store passes the contract
 * suite now. A place with neither is not offered. Each is listed once, in the order given.
 */
export async function storageOffered(choices: readonly StorageChoice[]): Promise<StorageChoice[]> {
  const seen = new Set<string>();
  const offered: StorageChoice[] = [];
  for (const choice of choices) {
    if (!NAME.test(choice.name) || seen.has(choice.name)) continue;
    seen.add(choice.name);
    if (choice.checked || (choice.trial && (await passes(choice.trial)))) offered.push(choice);
  }
  return offered;
}

/** Why there is no place in use: the host's own place is not offered, or the place chosen is not there now. */
export type NoPlace = 'no-host-place' | 'chosen-gone';

/** The place in use; or why there is none, by a code a host says from its catalogue, with the place's name. */
export type ChosenStorage =
  { ok: true; choice: StorageChoice; chosen: boolean } | { ok: false; reason: NoPlace; name: string };

/**
 * The place notes are kept: the one chosen, or with no choice made the host's own place, `hostDefault`. A chosen place
 * that is no longer offered, as when its plug-in is gone, is refused: the notes are never quietly written somewhere
 * else.
 */
export function storageInUse(
  offered: readonly StorageChoice[],
  setting: StorageSetting,
  hostDefault: string,
): ChosenStorage {
  const name = setting.where ?? hostDefault;
  const choice = offered.find((c) => c.name === name);
  if (choice) return { ok: true, choice, chosen: setting.where !== null };
  return { ok: false, reason: setting.where === null ? 'no-host-place' : 'chosen-gone', name };
}

/** A note moved: its path, and the version of it left in the old place, which letting go checks against. */
export interface MovedNote {
  path: string;
  version: string;
}

/** A move made and checked; or why not, and the paths it was refused for. Nothing is changed in the old place. */
export type MoveOutcome = { ok: true; moved: MovedNote[] } | { ok: false; reason: MoveRefused; paths: string[] };

/**
 * Why a move was refused, by a code a host says from its catalogue. `clash`: other text is already at a path in the new
 * place. `copy`: a copy did not read back. `changed`: a note changed in the old place meanwhile. `same`: the two places
 * are one.
 */
export const MOVE_REFUSED = { clash: 'clash', copy: 'copy', changed: 'changed', same: 'same' } as const;

/** Why a move was refused. */
export type MoveRefused = (typeof MOVE_REFUSED)[keyof typeof MOVE_REFUSED];

/**
 * Copies every note from `from` to `to`, then reads each back from both and checks the copy. The old place is not
 * changed. A note already in the new place with the same text is kept as it is. When any note there has other text, the
 * move is refused before anything is written. When the check fails, every note the move wrote is taken back, so the new
 * place is left as it was found.
 */
export async function moveNotes(
  from: NoteStorage,
  to: NoteStorage,
  options: { author?: string } = {},
): Promise<MoveOutcome> {
  if (from === to) return { ok: false, reason: MOVE_REFUSED.same, paths: [] };
  const paths = await from.list();
  const source = new Map<string, StoredNote>();
  const clashes: string[] = [];
  for (const path of paths) {
    const note = await from.read(path);
    if (!note) continue;
    source.set(path, note);
    const there = await to.read(path);
    if (there && there.text !== note.text) clashes.push(path);
  }
  if (clashes.length) return { ok: false, reason: MOVE_REFUSED.clash, paths: clashes };

  // each note the move writes, by the version it left, so a failed move takes back only its own
  const written = new Map<string, string | null>();
  const undo = async () => {
    for (const [path, version] of written) await to.remove(path, version === null ? {} : { expected: version });
  };
  const author = options.author === undefined ? {} : { author: options.author };
  for (const [path, note] of source) {
    if ((await to.read(path))?.text === note.text) continue;
    const done = await to.write(path, note.text, { ...author, expected: null });
    if (!done.ok) {
      await undo();
      return { ok: false, reason: MOVE_REFUSED.copy, paths: [path] };
    }
    written.set(path, done.version);
  }

  const badCopies: string[] = [];
  const changed: string[] = [];
  for (const [path, note] of source) {
    if ((await to.read(path))?.text !== note.text) badCopies.push(path);
    const now = await from.read(path);
    if (now?.version !== note.version || now.text !== note.text) changed.push(path);
  }
  const added = (await from.list()).filter((p) => !source.has(p));
  if (badCopies.length || changed.length || added.length) {
    await undo();
    return badCopies.length
      ? { ok: false, reason: MOVE_REFUSED.copy, paths: badCopies }
      : { ok: false, reason: MOVE_REFUSED.changed, paths: [...changed, ...added].sort() };
  }
  return { ok: true, moved: [...source].map(([path, note]) => ({ path, version: note.version })) };
}

/** What letting go of the old place did: the notes removed, and those kept because they changed after the move. */
export interface LetGo {
  removed: string[];
  kept: string[];
}

/**
 * Lets go of the old place once a move is checked and the user says so. Each note moved is removed from `from` only
 * while it is the version copied. A note changed since is kept, and named, so no change is lost.
 */
export async function letGoOfOld(
  from: NoteStorage,
  moved: readonly MovedNote[],
  options: { author?: string } = {},
): Promise<LetGo> {
  const removed: string[] = [];
  const kept: string[] = [];
  const author = options.author === undefined ? {} : { author: options.author };
  for (const { path, version } of moved) {
    const done = await from.remove(path, { ...author, expected: version });
    (done.ok ? removed : kept).push(path);
  }
  return { removed, kept };
}
