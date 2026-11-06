// The note's whiteboards on the browser editor's page (editor spec §45, board_view). It is the page VS Code's tab, the
// desktop app and the phone app run too. Each board block opens as the display layer's board, to pan, zoom and edit
// by pointer, touch and keyboard, offline. Each edit goes through the page's own version-checked write.
import { gqlBlocks, PALETTES, word } from '@thoughtknot/core';
import type { Together } from '@thoughtknot/core';
import { boardEditInNote, boardOf, showBoard } from '@thoughtknot/core/display/board/board-view';

/** The page's note as the board needs it: its text now, and its write against the version the page last saw. */
export interface BoardNote {
  readonly text: string;
  writeWhole(text: string): Promise<{ ok: true } | { ok: false; why: string }>;
}

/** What a host of shared boards puts on the page's window before the page starts: the seat of a note's board. */
export interface WithSeats {
  thoughtknotSeat?: (note: string, board: string) => Together | undefined;
}

/**
 * The seat at a shared board, when the host has shared it: the board's name gives its seat, or nothing when it is not
 * shared. The desktop and web apps set it. VS Code's tab and the Obsidian plug-in never do, so they stay offline.
 */
export type SeatFor = (name: string) => Together | undefined;

/**
 * A section with each board of the note opened, or null when the note holds none. `key` names the note. A board with
 * a seat is edited together with the others there, and the others are drawn on it.
 */
export function boardSection(
  doc: Document,
  note: BoardNote,
  key: string,
  dark: boolean,
  seatFor?: SeatFor,
): HTMLElement | null {
  const boards = gqlBlocks(note.text).filter((b) => boardOf(b.text));
  if (!boards.length) return null;
  const section = doc.createElement('section');
  section.setAttribute('class', 'gn-boards');
  section.setAttribute('aria-label', word('page.boards'));
  for (const b of boards) {
    const name = boardOf(b.text)?.name ?? '';
    const holder = section.appendChild(doc.createElement('div'));
    const seat = seatFor?.(name);
    const own = {
      palette: dark ? PALETTES.dark : PALETTES.light,
      key: `${key}\n${name}`,
    };
    if (seat) {
      showBoard(holder, seat.text(), { ...own, together: seat });
      continue;
    }
    showBoard(holder, b.text, {
      ...own,
      write: async (change) => {
        const r = boardEditInNote(note.text, name, change);
        if ('refused' in r) return r;
        const w = await note.writeWhole(r.note);
        return w.ok ? { text: r.text } : { refused: w.why };
      },
    });
  }
  return section;
}

/** Keeps the note's boards at the end of `parent`: each call opens them again from the note as it is now. */
export function boardsKept(
  parent: HTMLElement,
  note: BoardNote,
  key: string,
  dark: () => boolean,
  seatFor?: SeatFor,
): () => void {
  let boards: HTMLElement | null = null;
  return () => {
    boards?.remove();
    boards = boardSection(parent.ownerDocument, note, key, dark(), seatFor);
    if (boards) parent.append(boards);
  };
}
