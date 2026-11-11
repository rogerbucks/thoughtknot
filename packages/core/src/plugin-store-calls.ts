// The calls a registry makes into a store a plug-in adds: note storage, record stores, transports and panels (editor
// spec ES§43, plugin_manifest_limits). Each is timed, caught and named, as every call into a plug-in is (plugin-calls.ts).
import type { NoteStorage } from './note-storage.ts';
import type { PluginCalls, PluginResult } from './plugin-calls.ts';
import type {
  PanelRoot,
  PluginPanel,
  StorageBackend,
  SyncStore,
  SyncStoreBackend,
  SyncTransport,
  TransportBackend,
} from './plugin-points.ts';
import { word } from './words.ts';

/** The calls a registry makes into the record stores on its shelf: `owner` says whose each is. */
export function syncStoreCalls(calls: PluginCalls, items: SyncStoreBackend[], owner: Map<string, string>) {
  return {
    syncStores: () => items.map((b) => ({ ...b })),
    openSyncStore(name: string): PluginResult<SyncStore> {
      const b = items.find((x) => x.name === name);
      if (!b) return { ok: false, plugin: '', message: word('plugins.none.syncstore', { name }) };
      return calls.guarded(owner.get(name) ?? '', word('plugins.what.syncstore', { title: b.title }), () => b.open());
    },
  };
}

/** The calls a registry makes into the storage backends on its shelf: `owner` says whose each is. */
export function storageCalls(calls: PluginCalls, items: StorageBackend[], owner: Map<string, string>) {
  return {
    storages: () => items.map((b) => ({ ...b })),
    openStorage(name: string): PluginResult<NoteStorage> {
      const b = items.find((x) => x.name === name);
      if (!b) return { ok: false, plugin: '', message: word('plugins.none.storage', { name }) };
      return calls.guarded(owner.get(name) ?? '', word('plugins.what.storage', { title: b.title }), () => b.open());
    },
  };
}

/** The calls a registry makes into the transports on its shelf: `owner` says whose each is. */
export function transportCalls(calls: PluginCalls, items: TransportBackend[], owner: Map<string, string>) {
  return {
    transports: () => items.map((b) => ({ ...b })),
    openTransport(name: string): PluginResult<SyncTransport> {
      const b = items.find((x) => x.name === name);
      if (!b) return { ok: false, plugin: '', message: word('plugins.none.transport', { name }) };
      return calls.guarded(owner.get(name) ?? '', word('plugins.what.transport', { title: b.title }), () => b.open());
    },
  };
}

/** The calls a registry makes into the panels on its shelf: `owner` says whose each is. */
export function panelCalls(calls: PluginCalls, items: PluginPanel[], owner: Map<string, string>) {
  return {
    panels: () => items.map((c) => ({ ...c })),
    showPanel(id: string, el: PanelRoot): PluginResult<undefined> {
      const c = items.find((x) => x.id === id);
      if (!c) return { ok: false, plugin: '', message: word('plugins.none.panel', { name: id }) };
      return calls.guarded(
        owner.get(id) ?? '',
        word('plugins.what.panel', { title: c.title }),
        () => void c.render(el),
      );
    },
  };
}
