// The list of a note's boards, above the board in front (editor spec §45, board_many; panels start small). It starts
// folded to one line that names the board in front and how many there are. Opened, it has a button for each board, and
// New, Rename, Copy and Remove for the one in front. Removing asks first. The host's key keeps which board is in front
// and whether the list is open. So a host that draws afresh after a write shows the same again.
import { word } from '@thoughtknot/core';

import { boardListChanged, boardNames, type BoardListAsk } from '../../board-list.ts';

export { boardListChanged, boardNames };
export type { BoardListAsk };

/** What the list needs of its host. */
export interface BoardListHost {
  /** Names the note in its host. */
  key: string;
  /** The note's boards, in the order written. */
  names: readonly string[];
  /** The board in front. */
  current: string;
  /** Puts another board in front. */
  open: (name: string) => void;
  /** Does `ask` to the board in front, and answers why not when refused. Left out, the list only switches. */
  change?: (ask: BoardListAsk) => Promise<string | null>;
}

/** The board in front of each note, and whether its list was left open, by the host's key. */
const front = new Map<string, string>(),
  opened = new Map<string, boolean>();
/** The notes whose board in front has just changed, so the next one drawn glides in. */
const switched = new Set<string>();

/** The boards each note's board in front was entered through, outermost first, by the host's key (board_nested). */
const trails = new Map<string, string[]>();

/** The boards the board in front of the note `key` was entered through, outermost first. */
export function boardTrail(key: string): readonly string[] {
  return trails.get(key) ?? [];
}

/** Puts the board `name` in front, entered from the board `from` by zooming in on its view there. */
export function enterBoard(key: string, from: string, name: string): void {
  trails.set(key, [...boardTrail(key), from]);
  putInFront(key, name);
}

/** Puts the board the one in front was entered from back in front; `to` goes that many boards further out. */
export function leaveBoard(key: string, to = boardTrail(key).length - 1): void {
  const trail = boardTrail(key);
  const name = trail[to];
  if (name === undefined) return;
  trails.set(key, trail.slice(0, to));
  putInFront(key, name);
}

/** The board of `names` in front for the note `key`: the one last put there, else the first. */
export function boardInFront(key: string, names: readonly string[]): string | undefined {
  const kept = front.get(key);
  return kept !== undefined && names.includes(kept) ? kept : names[0];
}

/** Puts the board `name` in front for the note `key`; the board next drawn there glides in. */
export function putInFront(key: string, name: string | null): void {
  if (name === null) front.delete(key);
  else if (front.get(key) !== name) {
    front.set(key, name);
    switched.add(key);
  }
}

/** Marks the holder of a board just switched to, so it glides in; a board drawn again in place does not. */
export function glideIn(holder: HTMLElement, key: string): void {
  if (switched.delete(key)) holder.classList.add('thoughtknot-board-glide');
}

/** A button with its words. */
function wordButton(parent: HTMLElement, text: string, then: () => void): HTMLButtonElement {
  const b = parent.createEl('button', { text, attr: { type: 'button' } });
  b.addEventListener('click', then);
  return b;
}

/** The trail above a board entered by zooming in: each board it sits in is a way back out, then its own name. */
function showTrail(el: HTMLElement, host: BoardListHost): void {
  const trail = boardTrail(host.key).filter((name) => host.names.includes(name));
  if (!trail.length) return;
  const nav = el.createEl('nav', { cls: 'thoughtknot-board-trail', attr: { 'aria-label': word('board.trail') } });
  trail.forEach((name, n) => {
    const b = wordButton(nav, name, () => {
      leaveBoard(host.key, n);
      host.open(name);
    });
    b.setAttribute('aria-label', word('board.trail.back', { name }));
    nav.createSpan({ text: ' › ', attr: { 'aria-hidden': 'true' } });
  });
  nav.createSpan({ text: host.current, attr: { 'aria-current': 'true' } });
}

/** The list drawn in `el`: folded to one line at first. */
export function showBoardList(el: HTMLElement, host: BoardListHost): HTMLElement {
  const { names, current, key } = host;
  showTrail(el, host);
  const list = el.createEl('details', { cls: 'thoughtknot-board-list' });
  if (opened.get(key)) list.setAttribute('open', '');
  list.addEventListener('toggle', () => opened.set(key, list.hasAttribute('open')));
  list.createEl('summary', {
    text: word('board.list.count', { name: current, at: names.indexOf(current) + 1, count: names.length }),
  });
  const row = list.createDiv({
    cls: 'thoughtknot-board-list-names',
    attr: { role: 'group', 'aria-label': word('board.list') },
  });
  // one board alone has nothing to switch to, so it has no button
  for (const name of names.length > 1 ? names : []) {
    const b = wordButton(row, name, () => {
      trails.delete(key); // a board opened from the list is entered from nowhere
      putInFront(key, name);
      host.open(name);
    });
    b.setAttribute('aria-label', word('board.list.open', { name }));
    if (name === current) b.setAttribute('aria-current', 'true');
  }
  const change = host.change;
  if (!change) return list;
  const said = list.createEl('p', { cls: 'thoughtknot-board-list-said', attr: { role: 'status' } });
  const ask = (a: BoardListAsk) => void change(a).then((refused) => (said.textContent = refused ?? ''));
  const acts = list.createDiv({ cls: 'thoughtknot-board-list-acts' });
  wordButton(acts, word('board.list.add'), () => ask({ kind: 'add' }));
  const naming = list.createDiv({ cls: 'thoughtknot-board-list-naming' });
  naming.hidden = true;
  const input = naming.createEl('input', { attr: { type: 'text', 'aria-label': word('board.list.name') } });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') ask({ kind: 'rename', to: input.value });
    if (e.key === 'Escape') naming.hidden = true;
    if (e.key === 'Enter' || e.key === 'Escape') e.preventDefault();
  });
  wordButton(acts, word('board.list.rename'), () => {
    naming.hidden = false;
    input.value = current;
    input.focus();
    input.select();
  });
  wordButton(acts, word('board.list.nest'), () => ask({ kind: 'nest' }));
  wordButton(acts, word('board.list.copy'), () => ask({ kind: 'copy' }));
  const sure = list.createDiv({ cls: 'thoughtknot-board-list-sure' });
  sure.hidden = true;
  sure.createSpan({ text: `${word('board.list.remove-sure', { name: current })} ` });
  wordButton(sure, word('board.list.remove-yes'), () => ask({ kind: 'remove' }));
  wordButton(sure, word('board.list.remove-no'), () => (sure.hidden = true));
  wordButton(acts, word('board.list.remove'), () => (sure.hidden = false));
  return list;
}
