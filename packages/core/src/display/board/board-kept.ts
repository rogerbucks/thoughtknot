// What a board keeps for when its host draws it again (editor spec §45, board_view; nodes stay put, never disorient).
// A host may draw a board afresh after each write, as a note's page does. The new board takes up where the old one was.
// - The view is kept with the corner of the board it was measured from. A write that moves the corner moves nothing seen.
// - The keyboard stays on the board, on the item it was on, and what was last said is said again.
// - The board drawn before is dead once it is off the page: it keeps nothing more, and hands what it is asked to the new.
import type { View } from '@thoughtknot/core';

import type { BoardCursor } from '../../board-keys.ts';

/** What is kept of one board: its view, the corner that view is from, where the keyboard is, and what was said. */
export interface Kept {
  place: View;
  origin: readonly [number, number];
  cursor: BoardCursor;
  focused: boolean;
  said?: { words: string; at: number };
}

/** How long what was said is said again by a board drawn afresh, in milliseconds. */
const SAID_MS = 3000;

const kept = new Map<string, Kept>();
const live = new Map<string, { vp: HTMLElement; view: unknown }>();

/** What was kept of the board `key` names, if any. */
export const keptOf = (key: string): Kept | undefined => kept.get(key);

/** Whether the board with this viewport was taken off the page, so another stands in its place. */
const dead = (vp: HTMLElement): boolean => vp.isConnected === false;

/** Keeps the view and keyboard of a board, unless it is dead: a dead board must not undo what the new one keeps. */
export function keep(key: string, vp: HTMLElement, now: Omit<Kept, 'said'>): void {
  if (dead(vp) && live.get(key)?.vp !== vp) return;
  kept.set(key, { ...now, said: kept.get(key)?.said });
}

/** The view kept, moved so each spot of the board is where it was, now the board's corner is at `x`, `y`. */
export function placeFrom(was: Kept, x: number, y: number): [number, number, number] {
  const { scale } = was.place;
  return [scale, was.place.x + (x - was.origin[0]) * scale, was.place.y + (y - was.origin[1]) * scale];
}

/** A board just drawn stands for its key from now on. What was said a moment ago is put in its `said` line again. */
export function born(key: string, vp: HTMLElement, view: unknown, said: HTMLElement): void {
  live.set(key, { vp, view });
  const last = kept.get(key)?.said;
  if (last && Date.now() - last.at < SAID_MS) queueMicrotask(() => said.setText(last.words));
}

/** The board to act on: `view` itself, or the one drawn in its place once `view` is dead. */
export function current<V>(key: string, vp: HTMLElement, view: V): V {
  const now = live.get(key);
  return dead(vp) && now && now.vp !== vp ? (now.view as V) : view;
}

/** Says `words` in a board's `said` line, and keeps them for a board drawn afresh. */
export function saying(key: string, said: HTMLElement, words: string): void {
  said.setText(words);
  const was = kept.get(key);
  if (was) kept.set(key, { ...was, said: { words, at: Date.now() } });
}
