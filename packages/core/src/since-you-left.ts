// Where was I? After a break, the app offers a view of where the person was and what changed since. That is editor
// spec ES§74, since_you_left, and ethos principle 11. It is built from the focus trail, the graphs and things they opened
// (recent.ts), and from each note's own last change. It is offered quietly and opened only when asked. Nothing on
// screen moves until the person picks a place. Host-free and pure: the host keeps the trail and gives the change times.
import type { RecentVisit } from './recent.ts';
import { word } from './words.ts';

/** A break: this long away, the view is offered. */
export const BREAK_MINUTES = 30;
/** The most changes the view lists, newest first. */
export const CHANGES_MOST = 20;
/** The head of the trail takes a new time when it is opened again this long after, so a break counts from then. */
export const REVISIT_MINUTES = 5;

/** A note as the host knows it: its path and when it last changed, in milliseconds. */
export interface NoteChange {
  path: string;
  changed: number;
}

/** What the view shows: the places last visited, newest first, and each note changed since the last of them. */
export interface SinceView {
  places: RecentVisit[];
  changes: { path: string; at: string }[];
  /** How long ago the person was last here, in whole minutes. */
  away: number;
}

/** Whether a visit to the trail's head again at `now` should take the new time. */
export const staleHead = (head: RecentVisit | undefined, now: Date): boolean =>
  !head?.at || now.getTime() - Date.parse(head.at) >= REVISIT_MINUTES * 60_000;

/**
 * The view for a person back at `now`, from the trail and the notes' change times. It is null when the trail holds no
 * time. With `whenever` false, it is null before a break too. A note counts as changed when it changed after the last
 * visit.
 */
export function sinceYouLeft(
  trail: readonly RecentVisit[],
  notes: readonly NoteChange[],
  now: Date,
  whenever = false,
): SinceView | null {
  const at = trail[0]?.at;
  if (!at) return null;
  const left = Date.parse(at);
  const away = Math.max(0, Math.floor((now.getTime() - left) / 60_000));
  if (!whenever && away < BREAK_MINUTES) return null;
  const changes = notes
    .filter((n) => n.changed > left)
    .sort((a, b) => b.changed - a.changed)
    .slice(0, CHANGES_MOST)
    .map((n) => ({ path: n.path, at: new Date(n.changed).toISOString() }));
  return { places: [...trail], changes, away };
}

/** How long away, in words: minutes under an hour, else hours under two days, else days. */
export function awaySaid(minutes: number): string {
  if (minutes < 60) return word('since.away-minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 48
    ? word('since.away-hours', { count: hours })
    : word('since.away-days', { count: Math.floor(hours / 24) });
}

/** A place on the trail in words: the thing and its graph, or the graph, then the note. */
export const placeSaid = (v: RecentVisit): string =>
  v.thing
    ? word('since.place-thing', { thing: v.thing, graph: v.graph, note: v.path })
    : word('since.place-graph', { graph: v.graph, note: v.path });
