// The view preset panel on the browser editor's page (editor spec ES§69, view_presets_portable). It is the page VS
// Code's tab, the desktop app and the web run. The panel is the core's, the same one Obsidian's settings page uses.
// Here the settings are read only. So the vault's own preset file is the one place a preset is kept. Using a preset
// makes it the vault's, and the drawing follows it at once. Export hands the preset in use over as a file to keep.
import { PresetPanel, STARTERS, presetFrom, word } from '@thoughtknot/core';
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

/** Reads a preset file's `text`: a built-in preset is shown as a pick to preview, any other joins the person's list. */
async function bringIn(text: string, panel: PresetPanel): Promise<void> {
  const read = presetFrom(text);
  if ('problems' in read) return notice(read.problems.join(' '));
  if (STARTERS.some((s) => s.id === read.id)) return panel.pick(read.id);
  const why = await panel.bringIn(text);
  if (why) notice(why);
}

/** The control that takes a preset file: nothing leaves the page, the file is only read here. */
function importControl(win: Window & typeof globalThis, taken: (text: string) => void): HTMLElement {
  const label = win.document.createElement('label');
  label.textContent = word('page.preset-import');
  const input = win.document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void file.text().then(taken);
    input.value = '';
  });
  label.append(' ', input);
  return label;
}

/** The panel, drawn once the vault's preset is read. */
export async function presetSection(win: Window & typeof globalThis, deps: PresetSectionDeps): Promise<PresetSection> {
  let vault = (await deps.read()) ?? undefined;
  let draw = (): void => {};
  // the settings are read only here, so the person's own list lives for this page's visit (delete has its undo)
  let own = deps.settings.ownPresets;
  const setVault = async (id: string | null): Promise<void> => {
    const done = await deps.write(id);
    if (!done.ok) return notice(done.why);
    vault = id ?? undefined;
    deps.changed(vault);
  };
  const panel = new PresetPanel({
    settings: () => ({ ...deps.settings, ownPresets: own, viewPreset: vault ?? deps.settings.viewPreset }),
    save: async (next) => {
      own = next.ownPresets;
      if (next.viewPreset !== (vault ?? deps.settings.viewPreset)) await setVault(next.viewPreset);
    },
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
  el.append(importControl(win, (text) => void bringIn(text, panel)));
  return { el, vault: () => vault };
}
