// The view presets of the person's own, as the settings read them in (editor spec ES§69, view_presets_own_list).
// Host-free. It keeps settings.ts short and takes both kinds, the one brought in from a file and the list kept here.
import { adoptOwnList, ownPick } from './own-presets.ts';
import { OWN_PRESET, adoptOwn } from './view-presets.ts';
import type { Option } from './settings.ts';

/** The option for the list of own presets. The panel shows it as rows, never as the text it is kept in. */
export const OWN_PRESETS_OPTION: Option[] = [
  {
    key: 'ownPresets',
    section: 'Drawing',
    name: 'Your own view presets',
    sentence: 'The view presets you saved, each with the name you gave it. Pick, rename or delete them here.',
  },
];

/** The own presets in saved settings `s`, taken for every host, with the view preset chosen when it is one of them. */
export function ownFields(s: Record<string, unknown>, fallback: string, starter: (v: unknown) => string) {
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  const own = adoptOwn(text(s.ownPreset));
  const mine = adoptOwnList(text(s.ownPresets));
  return {
    ownPreset: own ? text(s.ownPreset) : '',
    ownPresets: mine.text,
    // a preset of the list is kept only while it is in the list; Your own only while there is one
    viewPreset:
      ownPick(s.viewPreset, mine.list, fallback) ??
      (s.viewPreset === OWN_PRESET && !own ? fallback : starter(s.viewPreset)),
  };
}
