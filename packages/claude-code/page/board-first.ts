// The board as the page's main screen (editor spec §45, board_main_screen). The page is the one VS Code's tab, the
// desktop app and the phone app run. A note opens on its board, above the graph drawn as before.
// - A note with no board yet opens on a starter board: one View item for each of its graphs, side by side. A note with
//   no graph either opens on an empty board (ES§76, board_first_new_note). Neither is written to the note until the
//   person changes it, so opening a note never changes it.
// - Until the person first chooses, one line says what changed, with a way back: the graph drawn first, as before.
//   The choice is kept for this person in this browser only.
import { word } from '@thoughtknot/core';

export { openingBoard, starterBoard, withStarter } from '@thoughtknot/core';

/** Where the choice of what comes first is kept for this person, in this browser. */
const FIRST_KEY = 'thoughtknot-board-first';

/** What a page keeps for its person: their window's storage, which may refuse, as in a private window. */
type Kept = Pick<Storage, 'getItem' | 'setItem'> | null;

/** The window's storage, or none where reading it is refused. */
export function keptIn(win: Window | null): Kept {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Whether the board comes first on the page: yes, unless this person chose the graph first. */
export function boardFirst(kept: Kept): boolean {
  try {
    return kept?.getItem(FIRST_KEY) !== 'graph';
  } catch {
    return true;
  }
}

/** Keeps this person's choice of what comes first. */
export function chooseFirst(kept: Kept, board: boolean): void {
  try {
    kept?.setItem(FIRST_KEY, board ? 'board' : 'graph');
  } catch {
    // nowhere to keep it: the page still shows what was chosen until it is opened again
  }
}

/** Whether the line about the change is still to be shown: until this person first chooses what comes first. */
export function firstTimeLine(kept: Kept): boolean {
  try {
    return (kept?.getItem(FIRST_KEY) ?? null) === null;
  } catch {
    return false;
  }
}

/** The line about the change, with its way back: a button that puts the graph first again. */
export function firstLine(doc: Document, back: () => void): HTMLElement {
  const line = doc.createElement('p');
  line.setAttribute('class', 'gn-board-first');
  line.setAttribute('role', 'status');
  line.append(doc.createTextNode(word('page.board-first')), ' ');
  const undo = line.appendChild(doc.createElement('button'));
  undo.setAttribute('type', 'button');
  undo.textContent = word('page.board-first.back');
  undo.addEventListener('click', back);
  return line;
}
