// What changing view preset would change, said before it does (editor spec §69, view_presets_predictable). Picking a
// preset first shows each Drawing setting it would turn, from what to what, in the person's words. Only then is it
// used, and it is undone in one step. Host-free and pure: a host's settings page shows the lines and buttons.
import { OPTIONS } from './settings.ts';
import type { Settings } from './settings.ts';
import { optionSaid } from './settings-words.ts';
import { presetChange } from './view-presets.ts';

/** One setting a preset would change: its key, its name, and what it is now and would be, in words. */
export interface PresetLine {
  key: keyof Settings;
  name: string;
  from: string;
  to: string;
}

/** A setting's value as its choice is named, else as it is. */
function valueSaid(key: keyof Settings, value: unknown): string {
  const o = OPTIONS.find((x) => x.key === key);
  const said = o ? optionSaid(o) : undefined;
  return said?.choices?.find((c) => c.value === value)?.name ?? String(value);
}

/** Each setting picking preset `id` would change in `s`, the preset itself first, in the order the page lists them. */
export function presetPreview(s: Settings, id: string): PresetLine[] {
  const change = presetChange(id);
  return OPTIONS.flatMap((o): PresetLine[] => {
    const key = o.key;
    if (!(key in change) || change[key] === s[key]) return [];
    return [{ key, name: optionSaid(o).name, from: valueSaid(key, s[key]), to: valueSaid(key, change[key]) }];
  });
}

/** What puts `s` back as it was before picking preset `id`: one step, each setting the preset changed. */
export function presetUndo(s: Settings, id: string): Partial<Settings> {
  return Object.fromEntries(presetPreview(s, id).map((l) => [l.key, s[l.key]]));
}
