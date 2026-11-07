// A vault can name a view preset of its own, not only a starter (editor spec ES§69, view_presets_own_vault).
// It stays the one small file at the vault top. The file is untrusted: it is read like any imported preset.
// Host-free and pure: a host reads and writes the file, as it does for a starter.
import { presetFile, presetFrom, setVaultOwn, STARTERS } from './view-presets.ts';
import { vaultPresetId } from './vault-preset.ts';
import type { ViewPreset } from './view-presets.ts';

/** The id of a preset a vault names for itself starts with this, so it is never taken for a starter or a person's own. */
export const VAULT_OWN_PREFIX = 'vault:';
/** The most bytes the file may hold, so one bad file cannot grow without end. */
export const VAULT_PRESET_MOST = 8000;

/** How many bytes `text` takes in UTF-8, counted without a host's encoder. */
function bytesOf(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * The preset a vault's file holds in full, or nothing. Nothing means no file, a file over the limit in bytes,
 * or a file that is not a preset. A file that names a starter is left to `vaultPresetId`.
 * Settings are raised to the floor as for any imported file.
 */
export function vaultOwnPreset(text: string | null | undefined): ViewPreset | undefined {
  if (!text || bytesOf(text) > VAULT_PRESET_MOST) return undefined;
  const read = presetFrom(text);
  if ('problems' in read || STARTERS.some((p) => p.id === read.id)) return undefined;
  const bare = read.id.replace(/^(own|vault):/, '');
  return bare ? { ...read, id: `${VAULT_OWN_PREFIX}${bare}` } : undefined;
}

/** The text of the file that makes `preset` the vault's own. A preset file is small by its form. */
export const vaultOwnFile = (preset: ViewPreset): string => presetFile(preset);

/**
 * The preset id the vault's file chooses, a starter's or the vault's own, or nothing. The vault's own preset is kept,
 * so its id can be turned into the preset. A file that names none makes the vault forget the one it had.
 */
export function vaultChoice(text: string | null | undefined): string | undefined {
  const mine = vaultOwnPreset(text);
  setVaultOwn(mine);
  return mine ? mine.id : vaultPresetId(text);
}
