// The vault's own view preset in Obsidian (editor spec ES§69, view_presets_scoped). It is one small file at the top of
// the vault, so it goes with the vault and syncs as the vault's other files do. The plugin reads it once the workspace
// is ready and again whenever the file changes, and every drawing is told. A graph's own preset still wins over it.
import { Notice, TFile } from 'obsidian';
import { VAULT_PRESET_PLACE, starterOf, vaultChoice, vaultPresetFile, word } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { exportText, vaultOps } from '../export/vault-write';

/** The preset the vault's file names, a starter's or its own, by plugin: nothing until the file is read, or when there is none. */
const chosen = new WeakMap<ThoughtKnotPlugin, string | undefined>();

/** The preset the vault chooses for itself, or nothing. */
export const vaultPresetOf = (plugin: ThoughtKnotPlugin): string | undefined => chosen.get(plugin);

/** Reads the vault's file again; every drawing is told when the answer changed. */
async function reread(plugin: ThoughtKnotPlugin): Promise<void> {
  const was = chosen.get(plugin);
  const now = vaultChoice(await exportText(plugin, VAULT_PRESET_PLACE));
  chosen.set(plugin, now);
  if (now !== was) plugin.profiles.redraw();
}

/** Reads the vault's preset now, and again each time its file is made, changed or removed. */
export async function watchVaultPreset(plugin: ThoughtKnotPlugin): Promise<void> {
  const mine = (f: { path: string }) => f.path === VAULT_PRESET_PLACE;
  const vault = plugin.app.vault;
  plugin.registerEvent(vault.on('create', (f) => mine(f) && void reread(plugin)));
  plugin.registerEvent(vault.on('modify', (f) => mine(f) && void reread(plugin)));
  plugin.registerEvent(vault.on('delete', (f) => mine(f) && void reread(plugin)));
  plugin.registerEvent(
    plugin.app.vault.on('rename', (f, old) => (mine(f) || old === VAULT_PRESET_PLACE) && void reread(plugin)),
  );
  await reread(plugin);
}

/** Makes starter `id` the vault's preset, or, with `null`, gives the vault none. Says what was done, or why not. */
export async function setVaultPreset(plugin: ThoughtKnotPlugin, id: string | null): Promise<void> {
  if (id === null) {
    const file = plugin.app.vault.getAbstractFileByPath(VAULT_PRESET_PLACE);
    if (file instanceof TFile) await plugin.app.fileManager.trashFile(file);
    new Notice(word('settings.vault-preset.cleared'));
  } else {
    // a small file written in place: the vault's own write replaces one that is there, a rename would not
    try {
      await vaultOps(plugin).write(VAULT_PRESET_PLACE, vaultPresetFile(id));
    } catch (e) {
      return void new Notice(String(e instanceof Error ? e.message : e));
    }
    new Notice(word('settings.vault-preset.written', { name: starterOf(id).name }));
  }
  await reread(plugin);
}
