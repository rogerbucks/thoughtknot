// A storage layer that shares chosen notes between devices (editor spec ES§41 and ES§40; storage_contract,
// mesh_vpn_sync). The note's file stays the truth: the Obsidian plug-in and the editor read and write it as ever. A
// write to a shared note is also kept in the note's CRDT and sent to the other device. What the other device sent is
// merged and written back to the file. A write made against an older text is refused as ever, with the note as it
// now is. So a clash is seen and nothing picks a side silently. Notes that are not shared pass through.
import type { NoteStorage, StorageLayer } from '@thoughtknot/core';
import type { SyncedNotes } from './synced-notes.ts';

/** What the layer needs to share notes. */
export interface SharedNotesOptions {
  /** Whether the note at `path` is shared. */
  shared(path: string): boolean;
  /** Who a change is kept for when the write names no one. */
  author: string;
  /** Sends this device's records to the other and takes in the other's: the live link's exchange. */
  exchange(): Promise<void>;
}

/** The layer, and `arrived`, which merges what the other device sent into every shared note this device has touched. */
export function sharedNotesLayer(
  notes: SyncedNotes,
  options: SharedNotesOptions,
): { layer: StorageLayer; arrived(): Promise<void> } {
  /** Each shared note this device has touched, and the work of opening it, which a second touch waits for. */
  const following = new Map<string, Promise<void>>();
  let inner: NoteStorage | undefined;

  /** Opens the shared note in the CRDT from its file, and writes each merge back to the file. */
  const follow = (path: string): Promise<void> => {
    const opening = following.get(path) ?? open(path);
    following.set(path, opening);
    return opening;
  };
  const open = async (path: string): Promise<void> => {
    if (!inner) return;
    // what the other device holds is taken in first, so a note both have is never started twice
    await options.exchange().catch(() => undefined);
    const here = await inner.read(path);
    await notes.open(path, here?.text);
    // a file that only lags behind the note takes the note's text; a file with an edit of its own keeps it, merged in
    const kept = notes.read(path).text;
    if (here && here.text !== kept) {
      if (notes.hasBeen(path, here.text)) await inner.write(path, kept, { author: options.author });
      else await notes.fromDisk(path, here.text, options.author);
    }
    notes.onChange(path, (change) => {
      if (!change.joined) return;
      void (async () => {
        const now = await inner!.read(path);
        const merged = notes.read(path).text;
        if (now?.text !== merged) await inner!.write(path, merged, { author: options.author });
      })();
    });
  };

  const layer: StorageLayer = (below) => {
    inner = below;
    return {
      list: () => below.list(),
      read: async (path) => {
        if (options.shared(path)) await follow(path);
        return below.read(path);
      },
      write: async (path, text, writing = {}) => {
        if (!options.shared(path)) return below.write(path, text, writing);
        await follow(path);
        const done = await below.write(path, text, writing);
        if (done.ok) {
          await notes.fromDisk(path, text, writing.author ?? options.author);
          // the other device may be away: the write is made, and the exchange is tried again at the next one
          await options.exchange().catch(() => undefined);
        }
        return done;
      },
      remove: (path, removing) => below.remove(path, removing),
    };
  };

  return {
    layer,
    arrived: async () => void (await Promise.all([...following.keys()].map((path) => notes.sync(path)))),
  };
}
