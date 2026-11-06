// Where graphs are kept, on the settings page (editor spec §55, ST1). In Obsidian the place is this vault: Obsidian
// edits only the vault's notes, and moving or syncing them is Obsidian's job (Roger, 6 Nov 2026). So the page says the
// place, and offers one choice that is opt in: keep who changed what (storage_history_layer). When it is on, the core's
// history layer keeps each change the plug-in makes to a note. It keeps them as notes in a vault folder, with the name
// on decisions. It is off until the person turns it on, and nothing is written for it until then.
import type { App, Plugin, SettingDefinitionItem } from 'obsidian';
import { deciderName, historyLayer, notePath, notesHistory, settingsFrom, word } from '@thoughtknot/core';
import type { NoteStorage, StorageLayer } from '@thoughtknot/core';
import type { SavedStore } from '../recent-visits';

/** The control key of a row of the group: `storage.` and the setting. */
export const STORAGE_KEY = 'storage.';

/** The folder changes are kept in when none is typed. */
export const HISTORY_FOLDER = 'ThoughtKnot history';

/** Where graphs are kept, as the plug-in keeps it in its data: whether who changed what is kept, and where. */
export interface KeptStorage {
  history: 'off' | 'on';
  /** The vault folder, as typed; empty is `HISTORY_FOLDER`. */
  historyFolder: string;
}

/** What was saved, read back: anything not understood is off, in the folder kept when none is typed. */
export function keptStorageFrom(saved: unknown): KeptStorage {
  const o = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  return {
    history: o.history === 'on' ? 'on' : 'off',
    historyFolder: typeof o.historyFolder === 'string' ? o.historyFolder.trim() : '',
  };
}

/** The folder changes are kept in: the one typed when it is a folder notes can be kept in, else `HISTORY_FOLDER`. */
export function historyFolderOf(kept: KeptStorage): string {
  const folder = kept.historyFolder.replace(/^\/+|\/+$/g, '');
  if (!folder) return HISTORY_FOLDER;
  try {
    notePath(`${folder}/x.md`);
    return folder;
  } catch {
    return HISTORY_FOLDER;
  }
}

/** The store each app's setting is kept in, set as the plug-in loads. */
const stores = new WeakMap<App, SavedStore>();

/** Reads where graphs are kept from `plugin`'s data, `store`. A host installed with no plug-in keeps nothing. */
export function keepStorage(plugin: Plugin | undefined, store: SavedStore): void {
  if (plugin) stores.set(plugin.app, store);
}

/** The store `app`'s setting is kept in, once the plug-in has loaded. */
export const storageStoreOf = (app: App): SavedStore | undefined => stores.get(app);

/**
 * The layers every note the plug-in writes in `app` goes through: none while who changed what is off. When it is on,
 * the history layer, kept as notes in `vault`. Those are the vault's notes with no layer, so a kept change is not kept
 * again.
 * Each change is kept with the name on decisions.
 */
export function storageLayers(app: App, vault: () => NoteStorage): StorageLayer[] {
  const store = stores.get(app);
  if (!store) return [];
  const kept = keptStorageFrom(store.get().storage);
  if (kept.history !== 'on') return [];
  const author = deciderName(settingsFrom(store.get().settings).decider);
  const history = historyLayer(notesHistory(vault(), historyFolderOf(kept)));
  // the name goes on each change that does not already say who made it
  const named: StorageLayer = (inner) => ({
    list: () => inner.list(),
    read: (path) => inner.read(path),
    write: (path, text, options = {}) => inner.write(path, text, { author, ...options }),
    remove: (path, options = {}) => inner.remove(path, { author, ...options }),
  });
  return [history, named];
}

/** The section: the place, with its sentence, then keeping who changed what and its folder. */
export function storageGroup(): SettingDefinitionItem {
  return {
    type: 'group',
    heading: word('storage.heading'),
    items: [
      { name: word('storage.place'), desc: word('storage.place.sentence') },
      {
        name: word('storage.history'),
        desc: word('storage.history.sentence'),
        control: {
          type: 'dropdown',
          key: `${STORAGE_KEY}history`,
          options: { off: word('storage.history.off'), on: word('storage.history.on') },
        },
      },
      {
        name: word('storage.history.folder'),
        desc: word('storage.history.folder.sentence', { folder: HISTORY_FOLDER }),
        control: { type: 'text', key: `${STORAGE_KEY}historyFolder` },
      },
    ],
  };
}

/** A row's value as the page shows it. */
export const storageValue = (store: SavedStore, key: string): unknown =>
  keptStorageFrom(store.get().storage)[key.slice(STORAGE_KEY.length) as keyof KeptStorage];

/** A row changed on the page, saved at once. */
export function setStorageValue(store: SavedStore, key: string, value: unknown): void {
  const kept = { ...keptStorageFrom(store.get().storage), [key.slice(STORAGE_KEY.length)]: value };
  store.set({ ...store.get(), storage: keptStorageFrom(kept) });
}
