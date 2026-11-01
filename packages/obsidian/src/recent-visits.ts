// The graphs and things last opened, kept in the plugin's data (risk NEURO-11). The display layer notes each opening,
// and its details summary lists them, newest first. Going to one opens its note.
import type { Plugin } from 'obsidian';
import { visitsFrom, withVisit } from '@thoughtknot/core';
import type { RecentVisit } from '@thoughtknot/core';
import type { DisplayHost } from '@thoughtknot/core/display/host';
import type { Saved } from './saved';

/** Where the plugin's data is read and written whole. */
export interface SavedStore {
  get: () => Saved;
  set: (saved: Saved) => void;
}

/** The host's record of the graphs and things opened, in `store`. */
export function recentVisits(plugin: Plugin, store: SavedStore): NonNullable<DisplayHost['recent']> {
  return {
    list: () => visitsFrom(store.get().visits),
    visit: (graph, thing) => {
      const path = plugin.app.workspace.getActiveFile()?.path;
      if (!path) return;
      const visit: RecentVisit = thing === undefined ? { path, graph } : { path, graph, thing };
      const kept = visitsFrom(store.get().visits);
      // the newest one is already first: nothing to write for it
      if (JSON.stringify(kept[0]) === JSON.stringify(visit)) return;
      store.set({ ...store.get(), visits: withVisit(kept, visit) });
    },
    open: (visit) => void plugin.app.workspace.openLinkText(visit.path, ''),
  };
}
