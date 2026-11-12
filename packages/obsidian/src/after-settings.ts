// What runs once the settings are read as the plugin loads. The routines are kept through an update (ES§74,
// routines_survive_update), and Where was I? is offered after a break (since_you_left). Kept apart so main.ts stays
// short.
import { keepRoutines } from './keep-routines';
import { offerSinceYouLeft } from './since-you-left';
import type ThoughtKnotPlugin from './main';

/** Keeps the routines and offers Where was I?, before this session adds to the trail. */
export function afterSettings(plugin: ThoughtKnotPlugin): void {
  keepRoutines(plugin.saved, plugin.settings, (saved) => void plugin.saveData((plugin.saved = saved)));
  offerSinceYouLeft(plugin, () => plugin.saved);
}
