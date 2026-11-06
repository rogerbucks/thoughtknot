// Changing view preset on the settings page, predictably (editor spec §69, view_presets_predictable). A preset picked
// is not used at once: the page first says what it would change, from what to what. Use this preset makes the
// change; Keep as it was drops it. Once used, one press undoes it. Nothing on a drawing moves until then.
// A preset moves between hosts as one small file (view_presets_portable). Its text pasted in is checked, then is Your
// own. Export writes the one in use, as set now.
import { Notice } from 'obsidian';
import { PresetPanel, word } from '@thoughtknot/core';
import type { PanelOwner, PanelRow } from '@thoughtknot/core';
import type { SettingDefinition } from 'obsidian';
import { writeSafely } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { freePaths, vaultOps } from '../export/vault-write';

/** Writes a preset's file into the export folder, under a name of its own, and says where or why not. */
export async function sharePreset(plugin: ThoughtKnotPlugin, text: string): Promise<void> {
  const folder = plugin.settings.exportFolder; // already a folder of the vault, as the settings read it
  const [path = 'View preset.json'] = freePaths(plugin, [`${folder ? `${folder}/` : ''}View preset.json`]);
  const done = await writeSafely(path, text, vaultOps(plugin));
  new Notice(done.ok ? word('settings.own-preset.exported', { path }) : done.why);
}

/** What the page needs: the core's panel owner, which the settings page fills in. */
export type PresetOwner = PanelOwner;

/** The preset panel of the settings page: the core's, one for every host. */
export { PresetPanel as PresetChoice };

/** The panel's rows as the settings page takes them. */
export const asSettings = (rows: PanelRow[]): SettingDefinition[] =>
  rows.map((r) => (r.action ? { name: r.name, desc: r.desc, action: r.action } : { name: r.name, desc: r.desc }));
