// What a host that may not run WebAssembly needs to share notes (the app's window; editor spec ES§40, ES§41). The notes
// are kept by the host and asked for over calls, so nothing here loads the Automerge build. The entry `index.ts` has
// everything, and a bundle that took it would carry WebAssembly.
import { RemoteCrdt } from './remote-crdt.ts';
import type { RemoteCall } from './remote-crdt.ts';
import { Engine } from './engine.ts';
import type { VaultKey } from './keys.ts';
import { Projection } from './projection.ts';
import { SealedStore } from './sealed-store.ts';
import type { Store } from './store.ts';
import { SyncedNotes } from './synced-notes.ts';

export { KeptStore, type Shelves } from './kept-store.ts';
export { MeshLink } from './mesh-link.ts';
export { sharedBoard, type Link } from './shared-board.ts';
export { sharedNotesLayer } from './shared-notes-layer.ts';

/** The five layers for `device` over `store`, with the notes kept by a host that answers over `call` (the app, in Rust). */
export const syncedRemote = (store: Store, key: VaultKey, device: string, call: RemoteCall): SyncedNotes =>
  new SyncedNotes(new Projection(new Engine(new RemoteCrdt(call, new SealedStore(store, key), device))));
