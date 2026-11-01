// The whole host Obsidian gives the core (editor spec §41, host_contract_published; risk ARCH-1). It is made of the
// plugin's own parts: its display, its links, its settings, Obsidian's secret storage, the vault, its drafts and its
// layout worker. A new host builds the same interface from its own parts, and test/host-adapters.test.js holds each
// to the one contract. So no host copies another's glue.
import { settingsFrom } from '@thoughtknot/core';
import { displayHost } from '@thoughtknot/core/display/host';
import type { Host } from '@thoughtknot/core/display/host';
import type ThoughtKnotPlugin from './main';
import { newDraftId } from './drafts';
import { linkHost } from './links/link-host';
import { vaultNotes } from './storage/plugin-notes';

/** The plugin's parts as the one host interface. The display is the one installed when the plugin loaded. */
export function obsidianHost(plugin: ThoughtKnotPlugin): Host {
  return {
    display: displayHost(),
    links: (path, graph) => ({ ...linkHost(plugin, path, graph), broken: [] }),
    settings: {
      load: async () => plugin.settings,
      save: (value) => plugin.saveSettings(settingsFrom(value)),
    },
    secrets: { get: (name) => plugin.app.secretStorage.getSecret(name) },
    files: vaultNotes(plugin.app),
    drafts: {
      read: async (key) => plugin.drafts()[key]?.text ?? null,
      keep: async (key, text) => {
        const drafts = plugin.drafts();
        // a draft kept again keeps its id, so the banner that shows it still finds it (drafts.ts)
        const id = drafts[key]?.id ?? newDraftId();
        await plugin.saveDrafts({ ...drafts, [key]: { text, kept: new Date().toISOString(), id } });
      },
      clear: async (key) => {
        const drafts = plugin.drafts();
        delete drafts[key];
        await plugin.saveDrafts(drafts);
      },
    },
    layout: { draw: (drawing, owner) => plugin.layout(drawing, owner) },
  };
}
