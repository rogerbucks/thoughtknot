// Sharing at work in the app's window (editor spec ES§40 and ES§41; mesh_vpn_sync, board_live_together). When this
// device holds a shared vault and the person has set where the link runs, the notes are kept in Rust (the `crdt_*`
// commands) and shared over the mesh commands, sealed. A write to a note is sent to the other device. A board in a note
// gets a seat, so the people there edit it together. With no vault, no keeper or no link, nothing here runs and the
// window stays as it was. `invoke` is handed in, so nothing here imports Tauri and the tests hand in their own.
import type { StorageLayer } from '@thoughtknot/core';
import {
  KeptStore,
  MeshLink,
  sharedBoard,
  sharedNotesLayer,
  syncedRemote,
  type Link,
  type Shelves,
} from '@thoughtknot/sync/remote';
import { fromHex, Sharing, type Keeper } from '@thoughtknot/sync/sharing';
import type { Together } from '@thoughtknot/core';
import { dialDevice, listenForDevice } from './tauri-mesh.ts';
import type { Invoke } from './tauri-files.ts';

/** What the window hands in. */
export interface SharedOptions {
  invoke: Invoke;
  keeper: Keeper | undefined;
  shelves: Shelves | undefined;
}

/** Sharing as running: the layer for the notes' storage, and the seat at a board. */
export interface Shared {
  layer: StorageLayer;
  /** The seat at the board `board` of the note `note`, or nothing when that note is not open for sharing yet. */
  seat(note: string, board: string): Together | undefined;
  /** Stops listening for the other device. */
  stop(): Promise<void>;
}

/** Starts sharing when this device holds a vault and a place to keep records; otherwise nothing. */
export async function startShared(o: SharedOptions): Promise<Shared | undefined> {
  if (!o.keeper || !o.shelves) return undefined;
  const sharing = await Sharing.open(o.keeper);
  if (!sharing?.hasVault) return undefined;
  const { keys, vault } = sharing.held;
  const { dial, listen } = sharing.link;
  // with no address for either, there is no link: the notes stay as they are
  if (!vault || (!dial && !listen)) return undefined;
  const trusted = sharing.trusted.map((k) => fromHex(k)).filter((k): k is Uint8Array => k !== null);
  const store = new KeptStore(o.shelves);
  const device = sharing.publicKey;
  const notes = syncedRemote(store, vault, device, o.invoke);
  const link = new MeshLink(keys, store, trusted, () =>
    dial ? dialDevice(o.invoke, dial) : Promise.reject(new Error('no address for the other device')),
  );

  // the link tells one listener; the notes and each board seat all want to hear
  const heard = new Set<(message: string) => void>();
  const arrived = new Set<() => void>();
  link.listen(
    (m) => heard.forEach((h) => h(m)),
    () => arrived.forEach((a) => a()),
  );
  const together: Link = {
    exchange: () => link.exchange(),
    send: (m) => link.send(m),
    listen(h, a) {
      heard.add(h);
      arrived.add(a);
    },
  };
  const shared = sharedNotesLayer(notes, {
    shared: () => true,
    author: device.slice(0, 8),
    exchange: () => link.exchange(),
  });
  arrived.add(() => void shared.arrived());

  const listener = listen ? await listenForDevice(o.invoke, listen) : undefined;
  const serving = listener && link.serve(() => listener.next());

  const seats = new Map<string, Together>();
  const role = sharing.joined?.as ?? 'edit';
  return {
    layer: shared.layer,
    seat(note, board) {
      const key = `${note}\u0000${board}`;
      const kept = seats.get(key);
      if (kept) return kept;
      try {
        notes.read(note);
      } catch {
        return undefined;
      }
      const made = sharedBoard(
        notes,
        note,
        board,
        { id: device.slice(0, 16), name: device.slice(0, 8) },
        role,
        together,
      );
      seats.set(key, made);
      return made;
    },
    async stop() {
      serving?.stop();
      await listener?.stop();
    },
  };
}
