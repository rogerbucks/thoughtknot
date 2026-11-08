// A facilitated session on a board (editor spec §45, board_facilitation). A session may run a shared timer, and may
// keep each person's new notes hidden from the others until they are revealed. A hidden note carries `hidden: true` and
// its writer's name as `author` in its own text, so the note stays the only store. The timer is a start time and a
// length that every person reads the same. Pure and host-free: the host passes in the time.
import type { Board, BoardItem } from './board.ts';
import { word } from './words.ts';

/** A shared timer: when it started, in milliseconds, how long it runs in seconds, and what it is for. */
export interface Timer {
  startedAt: number;
  seconds: number;
  label?: string;
}

/** The seconds left on a timer at `now`, never below nothing. */
export function secondsLeft(timer: Timer, now: number): number {
  return Math.max(0, Math.ceil(timer.seconds - (now - timer.startedAt) / 1000));
}

/** Whether the time is up. */
export const timeIsUp = (timer: Timer, now: number): boolean => secondsLeft(timer, now) === 0;

/** The time left as minutes and seconds, such as `4:05`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The timer in words, for a screen reader: the time left, or that it is up. */
export function timerSaid(timer: Timer, now: number): string {
  const left = secondsLeft(timer, now);
  const label = timer.label ? timer.label : '';
  return left
    ? word('board.timer.left', { time: clock(left), label }).trim()
    : word('board.timer.up', { label }).trim();
}

/** Whether a note is hidden: written to stay unseen by others until it is revealed. */
export const isHidden = (item: BoardItem): boolean => item.more.hidden === true;

/** The person who wrote a hidden note, or null when none is named. */
export const authorOf = (item: BoardItem): string | null =>
  typeof item.more.author === 'string' ? item.more.author : null;

/** The item's `more` with `hidden` and `author` set, or both taken off when `hidden` is false. */
export function hiddenMore(item: BoardItem, person: string, hidden: boolean): BoardItem['more'] {
  const more = { ...item.more };
  if (hidden) {
    more.hidden = true;
    more.author = person;
  } else {
    delete more.hidden;
    delete more.author;
  }
  return more;
}

/**
 * The board as `person` sees it: a hidden note written by someone else is left out, with the connectors that reach it.
 * Their own hidden notes stay in sight. Nothing is changed on the board itself.
 */
export function seenBy(board: Board, person: string): Board {
  const out = new Set(board.items.filter((i) => isHidden(i) && authorOf(i) !== person).map((i) => i.id));
  return {
    ...board,
    items: board.items.filter((i) => !out.has(i.id)),
    connectors: board.connectors.filter((c) => !out.has(c.from) && !out.has(c.to)),
  };
}

/** How many hidden notes `person` cannot see, so they can be told that more are to come. */
export const hiddenFrom = (board: Board, person: string): number =>
  board.items.length - seenBy(board, person).items.length;
