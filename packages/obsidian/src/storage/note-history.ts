// The earlier versions of the notes the plug-in changed, kept in its own data (editor spec §41, changes_view_obsidian;
// risk NEURO-2). Every note is written through the one storage interface (plugin-notes.ts). So the text each note had
// before the plug-in changed it is kept here. A burst of changes is one version (note-history.ts in the core). The
// card's Compare with draws a kept version with the note as it is now.
import type { App, Plugin } from 'obsidian';
import { historyFrom, historyMoved, withVersion } from '@thoughtknot/core';
import type { NoteVersion } from '@thoughtknot/core';
import type { SavedStore } from '../recent-visits';

/** The store each app's history is kept in, set as the plug-in loads. */
const stores = new WeakMap<App, SavedStore>();

/**
 * Keeps the history of the notes of `plugin`'s vault in its data, `store`, following each note renamed. A host
 * installed with no plug-in, as the host contract's own check does, keeps none.
 */
export function keepHistory(plugin: Plugin | undefined, store: SavedStore): void {
  if (!plugin) return;
  stores.set(plugin.app, store);
  plugin.registerEvent(plugin.app.vault.on('rename', (f, old) => followHistory(plugin.app, old, f.path)));
}

/** Keeps `before`, the text the note at `path` had just before the plug-in changed it; none when not kept for `app`. */
export function keeperOf(app: App): ((path: string, before: string) => void) | undefined {
  const store = stores.get(app);
  if (!store) return undefined;
  return (path, before) => {
    const was = historyFrom(store.get().history),
      now = withVersion(was, path, before, new Date());
    if (now !== was) store.set({ ...store.get(), history: now });
  };
}

/** The earlier versions kept of the note at `path`, newest first. */
export function versionsOf(app: App, path: string): NoteVersion[] {
  return historyFrom(stores.get(app)?.get().history)[path] ?? [];
}

/** The versions of the note renamed from `from` follow it to `to`. */
export function followHistory(app: App, from: string, to: string): void {
  const store = stores.get(app);
  if (!store) return;
  const was = historyFrom(store.get().history),
    now = historyMoved(was, from, to);
  if (now !== was) store.set({ ...store.get(), history: now });
}
