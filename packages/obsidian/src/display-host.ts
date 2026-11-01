// Obsidian's side of the display layer (`@thoughtknot/core/display/host`). The layer asks its host for the icons, the
// phone test, the notice, the menu and a side pane for a card's details. Here they are made of Obsidian's own
// `setIcon`, `Platform`, `Notice`, `Menu` and a view in its sidebar. Installed once, when the plugin loads, before
// anything is drawn.
import { getLanguage, Menu, Notice, Platform, setIcon } from 'obsidian';
import type { Plugin } from 'obsidian';
import { installHost } from '@thoughtknot/core/display/host';
import { noticeMs } from '@thoughtknot/core/display/notices';
import { detailsSidePane } from './details-pane';
import { recentVisits } from './recent-visits';
import type { SavedStore } from './recent-visits';
import { keepHistory } from './storage/note-history';

export { chooseLanguage } from '@thoughtknot/core/display/language';

/**
 * Installs Obsidian as the host the display layer draws in, with `plugin`'s details pane as its side pane. `store` is
 * where the plugin's data is kept: the details' last place and size, and the graphs and things last opened. It
 * also keeps the notes' earlier versions.
 */
export function installObsidianHost(plugin: Plugin, store: SavedStore): void {
  installHost({
    icon: (el, name) => setIcon(el, name),
    isPhone: () => Platform.isPhone,
    notice: (message) => {
      new Notice(message, noticeMs(message));
    },
    menu: (entries, at, doc) => {
      const m = new Menu();
      for (const e of entries) {
        if (e === 'separator') {
          m.addSeparator();
          continue;
        }
        m.addItem((item) => {
          item.setTitle(e.title).setIcon(e.icon);
          if (e.checked !== undefined) item.setChecked(e.checked);
          if (e.warning) item.setWarning(true);
          item.onClick(e.onClick);
        });
      }
      m.showAtPosition(at, doc);
    },
    language: () => getLanguage(),
    sidePane: detailsSidePane(plugin),
    detailsLayout: {
      saved: () => store.get().detailsLayout,
      save: (detailsLayout) => store.set({ ...store.get(), detailsLayout }),
    },
    recent: recentVisits(plugin, store),
  });
  // the text of each note just before the plug-in changes it, for Compare with (risk NEURO-2); it follows a rename
  keepHistory(plugin, store);
}
