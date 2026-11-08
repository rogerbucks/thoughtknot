// The view preset a vault chooses for itself (editor spec ES§69, view_presets_scoped). It is a plain file in the
// vault, so it travels with the vault and syncs as the vault's other files do. A graph's own preset wins over the
// vault's, which wins over the one the settings pick for everything. Host-free and pure: a host reads and writes the file.
import { word } from './words.ts';
import { presetFile, presetFor, presetFrom, starterOf, STARTERS } from './view-presets.ts';

/** Where the vault's preset is kept: one small file at the vault's top. */
export const VAULT_PRESET_PLACE = 'ThoughtKnot view preset.json';

/** Where the preset in use comes from. */
export type PresetScope = 'graph' | 'vault' | 'everywhere' | 'built-in';

/**
 * The starter a vault's preset file names, or nothing when there is no file, it is not a preset file, or it names no
 * starter. The file is untrusted: it is read like any imported preset, and only a starter's id is taken from it.
 */
export function vaultPresetId(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const read = presetFrom(text);
  if ('problems' in read) return undefined;
  return STARTERS.some((p) => p.id === read.id) ? read.id : undefined;
}

/** The text of the file that makes starter `id` the vault's preset. */
export const vaultPresetFile = (id: string): string => presetFile(starterOf(id));

/** The preset in use, and which choice it comes from: the nearest of the graph's, the vault's, the settings'. */
export function presetIn(chosen: { graph?: string; vault?: string; everywhere?: string }): {
  id: string;
  scope: PresetScope;
} {
  const id = presetFor(chosen).id;
  if (chosen.graph) return { id, scope: 'graph' };
  if (chosen.vault) return { id, scope: 'vault' };
  return { id, scope: chosen.everywhere && chosen.everywhere !== 'default' ? 'everywhere' : 'built-in' };
}

/** One line saying which preset is in use and where it comes from. */
export function presetInUse(chosen: { graph?: string; vault?: string; everywhere?: string }): string {
  const { id, scope } = presetIn(chosen);
  return word('settings.vault-preset.active', {
    name: starterOf(id).name,
    where: word(`settings.vault-preset.${scope}`),
  });
}
