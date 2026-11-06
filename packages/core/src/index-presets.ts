// The names the core's entry exports for the view preset a vault chooses (editor spec ES§69, view_presets_scoped). Kept
// apart from index-late.ts so each file stays short.
export {
  VAULT_PRESET_PLACE,
  presetIn,
  presetInUse,
  vaultPresetFile,
  vaultPresetId,
  type PresetScope,
} from './vault-preset.ts';
export { PresetPanel, type PanelOwner, type PanelRow } from './preset-panel.ts';
