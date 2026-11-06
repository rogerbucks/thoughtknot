// The view preset panel, one for every host (editor spec ES§69, view_presets_portable, view_presets_scoped). It holds
// what the panel says and does: which preset is in use and who chose it, the preset picked but not yet used with what
// it would change, the one step back, and the vault's own preset. A host shows its rows its own way and brings its own
// settings, vault file and share. Host-free.
import { word } from './words.ts';
import { OWN_PRESET, presetChange, presetFrom, presetToShare, starterOf } from './view-presets.ts';
import { presetPreview, presetUndo } from './view-preset-preview.ts';
import { presetInUse } from './vault-preset.ts';
import type { Settings } from './settings.ts';

/** One row of the panel: a name and a sentence, and what pressing it does, when it can be pressed. */
export interface PanelRow {
  name: string;
  desc: string;
  action?: () => void;
}

/** What the panel needs of its host: the settings now, a way to save them, to draw again, and the vault's file. */
export interface PanelOwner {
  settings: () => Settings;
  save: (next: Settings) => Promise<void>;
  update: () => void;
  /** Writes a preset's file text where the person keeps their files. */
  share: (text: string) => Promise<void>;
  /** The starter the vault's own preset file names, if any (view_presets_scoped). */
  vault: () => string | undefined;
  /** Makes a starter the vault's preset, or with null gives the vault none. */
  setVault: (id: string | null) => Promise<void>;
}

/** The preset picked but not yet used, and the one step back from the last one used. */
export class PresetPanel {
  pending: string | null = null;
  private undo: Partial<Settings> | null = null;

  private readonly owner: PanelOwner;

  constructor(owner: PanelOwner) {
    this.owner = owner;
  }

  /** The preset the picker shows: the one picked, else the one in use. */
  shown(): string {
    return this.pending ?? this.owner.settings().viewPreset;
  }

  /** A preset picked: shown with what it would change, not used yet. Picking the one in use drops the pick. */
  pick(id: string): void {
    this.pending = id === this.owner.settings().viewPreset ? null : id;
    this.owner.update();
  }

  /** The rows under the picker: which preset is in use and where it comes from, then the change in hand. */
  rows(): PanelRow[] {
    const s = this.owner.settings(),
      vault = this.owner.vault();
    const where = { vault, everywhere: s.viewPreset };
    return [
      { name: word('settings.vault-preset.name'), desc: presetInUse(where) },
      ...this.changeRows(),
      {
        name: word('settings.vault-preset.use'),
        desc: word('settings.vault-preset.use.sentence'),
        action: () => void this.owner.setVault(this.shown()).then(() => this.owner.update()),
      },
      ...(vault
        ? [
            {
              name: word('settings.vault-preset.clear'),
              desc: word('settings.vault-preset.clear.sentence'),
              action: () => void this.owner.setVault(null).then(() => this.owner.update()),
            },
          ]
        : []),
    ];
  }

  /** What the pick would change and its two buttons, or the one undo. */
  private changeRows(): PanelRow[] {
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
  ownRows(): PanelRow[] {
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
