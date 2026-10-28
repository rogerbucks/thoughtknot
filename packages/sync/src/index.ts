// The sync package's one entry (editor spec §40). Everything a host uses is exported from here, and only from here.
export { MemoryStore, framed, unframed, type Shelf, type Store } from './store.ts';
export { FolderStore, RECORDS_FILE, type FolderFiles } from './folder-store.ts';
export { DeviceKeys, VaultKey } from './keys.ts';
export { SealedStore } from './sealed-store.ts';
export { NoteCrdt, type Anchor, type Made, type NoteDoc } from './crdt.ts';
export { Engine, errorsOf, joinMerge, newErrors, type Joined, type Refused } from './engine.ts';
export { Projection, type Read } from './projection.ts';
export { SyncedNotes, spliceBetween, type Changed, type Splice } from './synced-notes.ts';
export { syncedInFolder, syncedOver } from './stack.ts';
export { MESH_VPNS, Peer, type Channel, type Synced } from './peer.ts';
export {
  OVERLAY_GRAPH,
  applyBundle,
  changesFor,
  homeChange,
  overlayChange,
  overlaysOf,
  rejoin,
  undoBundle,
  writable,
  type Applied,
  type Change,
  type Homes,
  type Overlay,
  type Rejoined,
} from './connected.ts';
