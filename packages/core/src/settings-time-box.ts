// A time box and quiet hours for AI sessions (editor spec §74, ai_time_box; ethos rule r_time_box). A person may set
// how long AI works each day, and hours when it never works. After either, AI waits until the next day, or until the
// quiet hours end. Both are off until the person sets them, so nothing is limited by default. The day and the hours
// are the device's own. A send is the only AI work there is (ai.ts), so the sends recorded today say when it began.
import type { Option } from './settings.ts';
import { word } from './words.ts';

/** How long AI may work each day, in minutes from the first send of the day; off for no limit. */
export type AiTimeBox = 'off' | 'quarter-hour' | 'half-hour' | 'hour' | 'two-hours';

/** The hours AI never works, from the first hour to the second; off for none. */
export type AiQuietHours = 'off' | 'nine-to-seven' | 'ten-to-seven' | 'eleven-to-six' | 'eight-to-eight';

/** The time box and the quiet hours. */
export interface TimeBoxSettings {
  aiTimeBox: AiTimeBox;
  aiQuietHours: AiQuietHours;
}

/** Off and off: nothing is limited until the person sets one. */
export const DEFAULT_TIME_BOX: TimeBoxSettings = { aiTimeBox: 'off', aiQuietHours: 'off' };

// each choice's minutes and hours; a choice is named in words, since the words catalogue keys it by its value
const MINUTES: Record<Exclude<AiTimeBox, 'off'>, number> = {
  'quarter-hour': 15,
  'half-hour': 30,
  hour: 60,
  'two-hours': 120,
};
const HOURS: Record<Exclude<AiQuietHours, 'off'>, [number, number]> = {
  'nine-to-seven': [21, 7],
  'ten-to-seven': [22, 7],
  'eleven-to-six': [23, 6],
  'eight-to-eight': [20, 8],
};
const BOXES = ['off', ...Object.keys(MINUTES)] as readonly AiTimeBox[];
const QUIET = ['off', ...Object.keys(HOURS)] as readonly AiQuietHours[];

/** The options, as the settings page shows them, with the AI models. */
export const TIME_BOX_OPTIONS: Option[] = [
  {
    key: 'aiTimeBox',
    section: 'AI models',
    name: 'Time box for AI',
    sentence:
      'How long AI may work each day, from the first time you send. After it, AI waits until tomorrow. Off until you set it.',
    choices: [
      { value: 'off', name: 'Off: no limit' },
      { value: 'quarter-hour', name: '15 minutes a day' },
      { value: 'half-hour', name: '30 minutes a day' },
      { value: 'hour', name: 'An hour a day' },
      { value: 'two-hours', name: 'Two hours a day' },
    ],
  },
  {
    key: 'aiQuietHours',
    section: 'AI models',
    name: 'Quiet hours for AI',
    sentence: 'Hours when AI never works, in this device’s time. Off until you set them.',
    choices: [
      { value: 'off', name: 'Off: none' },
      { value: 'nine-to-seven', name: '9 pm to 7 am' },
      { value: 'ten-to-seven', name: '10 pm to 7 am' },
      { value: 'eleven-to-six', name: '11 pm to 6 am' },
      { value: 'eight-to-eight', name: '8 pm to 8 am' },
    ],
  },
];

/** The settings read back from what was saved, anything unknown read as off. */
export function timeBoxFrom(s: Record<string, unknown>): TimeBoxSettings {
  const box = BOXES.find((b) => b === s.aiTimeBox) ?? DEFAULT_TIME_BOX.aiTimeBox;
  const quiet = QUIET.find((q) => q === s.aiQuietHours) ?? DEFAULT_TIME_BOX.aiQuietHours;
  return { aiTimeBox: box, aiQuietHours: quiet };
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Why AI waits now, in words; or null when it may work. `sends` are the times of the sends recorded. Quiet hours wait
 * until they end. A time box used up waits until the next day.
 */
export function aiWaits(s: TimeBoxSettings, now: Date, sends: readonly { at: string }[]): string | null {
  if (s.aiQuietHours !== 'off') {
    const [from, to] = HOURS[s.aiQuietHours];
    const h = now.getHours();
    if (from > to ? h >= from || h < to : h >= from && h < to)
      return word('ai.wait.quiet', { from: String(from), to: String(to) });
  }
  if (s.aiTimeBox === 'off') return null;
  const today = sends.map((r) => new Date(r.at)).filter((d) => !Number.isNaN(d.getTime()) && sameDay(d, now));
  if (!today.length) return null;
  const first = Math.min(...today.map((d) => d.getTime()));
  const minutes = MINUTES[s.aiTimeBox];
  return now.getTime() - first >= minutes * 60_000 ? word('ai.wait.time-box', { minutes: String(minutes) }) : null;
}
