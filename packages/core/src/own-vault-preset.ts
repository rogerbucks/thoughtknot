// A vault can name a view preset of its own, not only a starter (editor spec ES§69, view_presets_own_vault).
// It stays the one small file at the vault top. The file is untrusted: it is read like any imported preset.
// Host-free and pure: a host reads and writes the file, as it does for a starter.
import { presetFile, presetFrom, STARTERS } from './view-presets.ts';
import type { ViewPreset } from './view-presets.ts';

/** The id of a preset a vault names for itself starts with this, so it is never taken for a starter or a person's own. */
export const VAULT_OWN_PREFIX = 'vault:';
/** The most bytes the file may hold, so one bad file cannot grow without end. */
export const VAULT_PRESET_MOST = 8000;

/**
 * The preset a vault's file holds in full, or nothing when there is no file, it is too big, it is not a preset file,
 * or it names a starter, which `vaultPresetId` reads instead. Settings are raised to the floor as for any imported file.
 */
export function vaultOwnPreset(text: string | null | undefined): ViewPreset | undefined {
  if (!text || text.length > VAULT_PRESET_MOST) return undefined;
  const read = presetFrom(text);
  if ('problems' in read || STARTERS.some((p) => p.id === read.id)) return undefined;
  const bare = read.id.replace(/^(own|vault):/, '');
  return { ...read, id: `${VAULT_OWN_PREFIX}${bare}` };
}

/** The text of the file that makes `preset` the vault's own. A preset file is small by its form. */
export const vaultOwnFile = (preset: ViewPreset): string => presetFile(preset);
