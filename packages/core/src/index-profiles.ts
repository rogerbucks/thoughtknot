// The personal profiles' part of the core's entry (editor spec §39), kept apart so `index.ts` stays short.
export {
  CHUNK_RANGE,
  CUES,
  DENSITIES,
  PACE_MS,
  PACINGS,
  PERSONAL_LABELS,
  PersonalLayer,
  REMINDER_STYLES,
  SHARED_SETTINGS,
  composeProfiles,
  corporateView,
  profileOf,
} from './profiles.ts';
export type { Cues, Density, Pacing, ProfileSettings, ReminderStyle } from './profiles.ts';
export { ProfileLearning, type LearnedKept, type LearnedSuggestion } from './learning.ts';
export { PACING_SIGNALS_NEEDED, PacingDetector, type PaceShown, type PacingSignal } from './pacing.ts';
export { dueThings, remindersFor, type Reminder } from './reminders.ts';
// Where was I? after a break, from the focus trail (ES§74, since_you_left), 12 Nov 2026
export {
  BREAK_MINUTES,
  awaySaid,
  placeSaid,
  sinceYouLeft,
  staleHead,
  type NoteChange,
  type SinceView,
} from './since-you-left.ts';
