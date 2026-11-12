// An update never changes a person's saved views, presets or shortcuts without saying so first (editor spec §74,
// routines_survive_update; ethos rule r_routines). So routines built on the app survive an update. The settings that
// make a routine are listed here. As the settings are read in, each one saved that this version cannot keep is named.
// The host says so at once, before anything is saved over it, and keeps the old settings as they were saved.
import { OPTIONS } from './settings.ts';
import type { Settings } from './settings.ts';
import { optionSaid } from './settings-words.ts';
import { formatList } from './locale-formats.ts';
import { word } from './words.ts';

/** The settings a routine is built on: the language, the view presets, and how each graph is drawn by default. */
export const ROUTINE_KEYS = [
  'language',
  'viewPreset',
  'ownPreset',
  'ownPresets',
  'direction',
  'focusDepth',
  'labelsByZoom',
  'foldHubs',
  'foldGroups',
  'mergeLinks',
  'kindLanes',
  'noteCallouts',
  'miniMap',
  'detailsOpen',
  'drawingHeight',
  'easierReading',
  'newRendering',
] as const satisfies readonly (keyof Settings)[];

/** One of the settings a routine is built on. */
export type RoutineKey = (typeof ROUTINE_KEYS)[number];

/** The routine settings that were saved but are not kept as saved, once read in as `loaded`; none when all are kept. */
export function routinesLost(saved: unknown, loaded: Settings): RoutineKey[] {
  if (!saved || typeof saved !== 'object') return [];
  const s = saved as Record<string, unknown>;
  return ROUTINE_KEYS.filter((k) => Object.hasOwn(s, k) && JSON.stringify(s[k]) !== JSON.stringify(loaded[k]));
}

/** What the person is told when an update cannot keep some of their routine settings: which, and that the old are kept. */
export function routinesLostSaid(lost: readonly RoutineKey[]): string {
  const names = lost.map((k) => {
    const o = OPTIONS.find((x) => x.key === k);
    return o ? optionSaid(o).name : k;
  });
  return word('settings.routines-lost', { count: lost.length, names: formatList(names) });
}
