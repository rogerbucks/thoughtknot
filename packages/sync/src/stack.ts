// The five layers put together for one device (editor spec §40, five_layer_stack). Roger, 28 Oct 2026 (Q-12 B). Each
// layer is given the one below it, and nothing else. From the bottom: the store sealed by the vault key, the CRDT, the
// engine, the projection, and the face every editor uses.
import { NoteCrdt } from './crdt.ts';
import { Engine } from './engine.ts';
import { FolderStore } from './folder-store.ts';
import type { FolderFiles } from './folder-store.ts';
import type { VaultKey } from './keys.ts';
import { Projection } from './projection.ts';
import { SealedStore } from './sealed-store.ts';
import type { Store } from './store.ts';
import { SyncedNotes } from './synced-notes.ts';

/** The five layers for `device` over `store`, sealed by `key`. */
export const syncedOver = (store: Store, key: VaultKey, device: string): SyncedNotes =>
  new SyncedNotes(new Projection(new Engine(new NoteCrdt(new SealedStore(store, key), device))));

/** The five layers for `device` over a folder that Syncthing shares, reached by `files`. */
export const syncedInFolder = (files: FolderFiles, key: VaultKey, device: string): SyncedNotes =>
  syncedOver(new FolderStore(files), key, device);
