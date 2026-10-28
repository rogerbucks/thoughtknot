// Changing view preset on the settings page, predictably (editor spec §69, view_presets_predictable). A preset picked
// is not used at once: the page first says what it would change, from what to what. Use this preset makes the
// change; Keep as it was drops it. Once used, one press undoes it. Nothing on a drawing moves until then.
// A preset moves between hosts as one small file (view_presets_portable). Its text pasted in is checked, then is Your
// own. Export writes the one in use, as set now.
import { Notice } from 'obsidian';
import type { SettingDefinition } from 'obsidian';
import {
  OWN_PRESET,
  presetChange,
  presetFrom,
  presetPreview,
  presetToShare,
  presetUndo,
  starterOf,
  word,
} from '@thoughtknot/core';
import { writeSafely } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { freePaths, vaultOps } from '../export/vault-write';

/** Writes a preset's file into the export folder, under a name of its own, and says where or why not. */
export async function sharePreset(plugin: ThoughtKnotPlugin, text: string): Promise<void> {
  const folder = plugin.settings.exportFolder; // already a folder of the vault, as the settings read it
  const [path = 'View preset.json'] = freePaths(plugin, [`${folder ? `${folder}/` : ''}View preset.json`]);
  const done = await writeSafely(path, text, vaultOps(plugin));
  new Notice(done.ok ? word('settings.own-preset.exported', { path }) : done.why);
}

/** What the page needs: the settings now, a way to save them, and to draw the page again. */
export interface PresetOwner {
  settings: () => Settings;
  save: (next: Settings) => Promise<void>;
  update: () => void;
  /** Writes a preset's file text where the person keeps their files. */
  share: (text: string) => Promise<void>;
}

/** The preset picked but not yet used, and the one step back from the last one used. */
export class PresetChoice {
  pending: string | null = null;
  private undo: Partial<Settings> | null = null;

  constructor(private readonly owner: PresetOwner) {}

  /** The preset the picker shows: the one picked, else the one in use. */
  shown(): string {
    return this.pending ?? this.owner.settings().viewPreset;
  }

  /** A preset picked: shown with what it would change, not used yet. Picking the one in use drops the pick. */
  pick(id: string): void {
    this.pending = id === this.owner.settings().viewPreset ? null : id;
    this.owner.update();
  }

  /** The rows under the picker: what the pick would change and its two buttons, or the one undo. */
  rows(): SettingDefinition[] {
    const s = this.owner.settings();
    if (this.pending) {
      const id = this.pending,
        lines = presetPreview(s, id).filter((l) => l.key !== 'viewPreset');
      const said = lines.length
        ? lines.map((l) => word('settings.view-preset.line', { ...l })).join(' ')
        : word('settings.view-preset.nothing');
      return [
        { name: word('settings.view-preset.preview', { name: starterOf(id).name }), desc: said },
        { name: word('settings.view-preset.use'), desc: '', action: () => void this.use(id) },
        { name: word('settings.view-preset.keep'), desc: '', action: () => this.pick(s.viewPreset) },
      ];
    }
    if (!this.undo) return [];
    const back = this.undo;
    return [
      {
        name: word('settings.view-preset.undo'),
        desc: word('settings.view-preset.undo.sentence', { name: starterOf(String(back.viewPreset)).name }),
        action: () => void this.back(back),
      },
    ];
  }

  /** What the pasted text of Your own reads as, and the row that exports the preset in use. */
  ownRows(): SettingDefinition[] {
    const s = this.owner.settings(),
      read = s.ownPreset ? presetFrom(s.ownPreset) : null;
    const said = !read
      ? ''
      : 'problems' in read
        ? word('settings.own-preset.problem', { why: read.problems.join(' ') })
        : word('settings.own-preset.taken', { name: read.name });
    return [
      ...(said ? [{ name: word('settings.own-preset.name'), desc: said }] : []),
      {
        name: word('settings.own-preset.export'),
        desc: word('settings.own-preset.export.sentence'),
        action: () => void this.owner.share(presetToShare(s)),
      },
    ];
  }

  /** Whether Your own may be picked: only once a preset of the person's own is read in. */
  offers(id: string): boolean {
    return id !== OWN_PRESET || !!this.owner.settings().ownPreset;
  }

  /** Uses preset `id`, keeping what puts every setting it changed back. */
  private async use(id: string): Promise<void> {
    const s = this.owner.settings();
    this.undo = presetUndo(s, id);
    this.pending = null;
    await this.owner.save({ ...s, ...presetChange(id) });
    this.owner.update();
  }

  /** Puts back the settings as they were before the last preset used: one step. */
  private async back(to: Partial<Settings>): Promise<void> {
    this.undo = null;
    await this.owner.save({ ...this.owner.settings(), ...to });
    this.owner.update();
  }
}
