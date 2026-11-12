// An update never changes a person's saved views, presets or shortcuts without saying so first (ES§74,
// routines_survive_update). As the plugin loads, it names at once each routine setting it cannot keep as saved. The
// notice stays until the person closes it. The settings as they were saved are kept beside the new ones, never
// written over. So going back to the last version brings them back.
import { Notice } from 'obsidian';
import { routinesLost, routinesLostSaid } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';
import type { Saved } from './saved';

/** Says which routine settings `loaded` cannot keep as saved, and keeps the saved ones as they were in `settingsBefore`. */
export function keepRoutines(saved: Saved, loaded: Settings, save: (saved: Saved) => void): void {
  const lost = routinesLost(saved.settings, loaded);
  if (!lost.length) return;
  // the first settings that could not be kept stay as they were: a later update never writes over them
  if (saved.settingsBefore === undefined) save({ ...saved, settingsBefore: saved.settings });
  new Notice(routinesLostSaid(lost), 0);
}
