// The ways to begin on an empty board (editor spec ES§76, board_first_ways_in): type a note, text to graph, or import.
// They are folded small into one line beside the board, never over it, so they cover nothing. They go once the
// first item is made. Typing needs nothing of the host; text to graph and import are the host's to open.
import type { Board } from '../../board.ts';
import { waysIn } from '../../board-first.ts';
import { word } from '../../words.ts';

/** What the ways to begin need of their host: what opens text to graph and import, and why AI is off, when it is. */
export interface BeginHost {
  textToGraph?: () => void;
  importing?: () => void;
  aiOff?: string;
}

/**
 * The ways to begin, folded, put in `root` after the board's viewport `vp`; or null when the board holds an item.
 * `say` speaks a sentence to a screen reader. Typing a note puts the keyboard on the board.
 */
export function showWaysIn(
  root: HTMLElement,
  vp: HTMLElement,
  board: Board,
  host: BeginHost | undefined,
  say: (words: string) => void,
): HTMLElement | null {
  const ways = waysIn(board, host?.aiOff);
  if (!ways.length) return null;
  const doc = root.ownerDocument;
  const box = doc.createElement('details');
  box.setAttribute('class', 'thoughtknot-board-ways');
  const summary = box.appendChild(doc.createElement('summary'));
  summary.textContent = word('board.first.ways');
  const list = box.appendChild(doc.createElement('ul'));
  for (const w of ways) {
    const li = list.appendChild(doc.createElement('li'));
    const button = li.appendChild(doc.createElement('button'));
    button.setAttribute('type', 'button');
    button.setAttribute('data-way', w.way);
    button.textContent = w.name;
    button.setAttribute('title', w.off ?? w.sentence);
    const open = w.way === 'text-to-graph' ? host?.textToGraph : w.way === 'import' ? host?.importing : undefined;
    const off = w.off ?? (w.way !== 'type' && !open ? w.sentence : undefined);
    if (off) button.setAttribute('aria-disabled', 'true'); // off, or not one this host opens yet
    button.addEventListener('click', () => {
      if (w.way === 'type') {
        vp.focus();
        say(w.sentence);
      } else if (off || !open) say(off ?? w.sentence);
      else open();
    });
  }
  root.appendChild(box); // straight after the viewport, outside it: the board is drawn in the viewport alone
  return box;
}

/** The ways taken away once the board holds an item; else left as they are. */
export function waysAfter(box: HTMLElement | null, board: Board): HTMLElement | null {
  if (box && board.items.length) {
    box.remove();
    return null;
  }
  return box;
}
