// The view preset panel on the browser editor's page (editor spec ES§69, view_presets_portable). It is the page VS
// Code's tab, the desktop app and the web run. The panel is the core's, the same one Obsidian's settings page uses.
// Here the settings are read only. So the vault's own preset file is the one place a preset is kept. Using a preset
// makes it the vault's, and the drawing follows it at once. Export hands the preset in use over as a file to keep.
import { PresetPanel, word } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';
import { presetPanelView } from '@thoughtknot/core/display/preset-panel-view';
import { notice } from '@thoughtknot/core/display/host';
import type { PresetWritten } from './vault-preset-calls.ts';

/** What the section needs: the settings, the vault's calls, and what to do when the vault's preset changes. */
export interface PresetSectionDeps {
  settings: Settings;
  read: () => Promise<string | null>;
  write: (id: string | null) => Promise<PresetWritten>;
  /** Told the starter the vault now names, or undefined for none, for the drawing to follow. */
  changed: (vault: string | undefined) => void;
}

/** The panel's section, and the starter the vault now names (undefined for none). */
export interface PresetSection {
  el: HTMLElement;
  vault: () => string | undefined;
}

/** Hands `text` to the person as the file `View preset.json`, to keep or move to another host. */
function download(win: Window & typeof globalThis, text: string): void {
  const url = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' }));
  const link = win.document.createElement('a');
  link.href = url;
  link.download = 'View preset.json';
  link.click();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
}

/** The panel, drawn once the vault's preset is read. */
export async function presetSection(win: Window & typeof globalThis, deps: PresetSectionDeps): Promise<PresetSection> {
  let vault = (await deps.read()) ?? undefined;
  let draw = (): void => {};
  const setVault = async (id: string | null): Promise<void> => {
    const done = await deps.write(id);
    if (!done.ok) return notice(done.why);
    vault = id ?? undefined;
    deps.changed(vault);
  };
  const panel = new PresetPanel({
    settings: () => ({ ...deps.settings, viewPreset: vault ?? deps.settings.viewPreset }),
    save: (next) => setVault(next.viewPreset),
    update: () => draw(),
    share: (text) => Promise.resolve(download(win, text)),
    vault: () => vault,
    setVault,
    vaultOnly: true,
  });
  const el = win.document.createElement('div');
  el.setAttribute('class', 'gn-presets');
  el.setAttribute('aria-label', word('settings.view-preset.name'));
  draw = presetPanelView(el, panel).refresh;
  return { el, vault: () => vault };
}
