// The board as the page's main screen (editor spec §45, board_main_screen). The page is the one VS Code's tab, the
// desktop app and the phone app run. A note opens on its board, above the graph drawn as before.
// - A note with no board yet opens on a starter board: one View item for each of its graphs, side by side. It is not
//   written to the note until the person changes it, so opening a note never changes it.
// - Until the person first chooses, one line says what changed, with a way back: the graph drawn first, as before.
//   The choice is kept for this person in this browser only.
import { gqlBlocks, readNote, word } from '@thoughtknot/core';

/** Where the choice of what comes first is kept for this person, in this browser. */
const FIRST_KEY = 'thoughtknot-board-first';
/** The size of each view on a starter board, and the gap between two, in board units. */
const W = 480,
  H = 360,
  GAP = 40;

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

/**
 * The starter board of a note with graphs and no board: its name and block text, one View item for each graph, side by
 * side. Null for a note that has a board, or no graph.
 */
export function starterBoard(note: string, isBoard: (text: string) => boolean): { name: string; text: string } | null {
  const blocks = gqlBlocks(note).map((b) => b.text);
  if (blocks.some(isBoard)) return null;
  const graphs = [...readNote(blocks).graphs.keys()];
  const first = graphs[0];
  if (first === undefined) return null;
  const name = `${first}_board`;
  const items = graphs.map((g, n) => `(view${n + 1}:View {x: ${n * (W + GAP)}, y: 0, w: ${W}, h: ${H}, of: '${g}'})`);
  return { name, text: [`// graph: ${name} · BOARD ON ${first}`, items.join(',\n')].join('\n') };
}

/** The note with the starter board's block written at its end, so a change can be made to it. */
export function withStarter(note: string, text: string): string {
  return `${note.replace(/\s*$/, '')}\n\n\`\`\`gql\n${text}\n\`\`\`\n`;
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
