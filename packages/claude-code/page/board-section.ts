// The note's whiteboards on the browser editor's page (editor spec §45, board_view). It is the page VS Code's tab, the
// desktop app and the phone app run too. The board in front opens as the display layer's board, to pan, zoom and edit
// by pointer, touch and keyboard, offline. The list above it switches between the note's boards (board_many). Each edit goes through the page's own version-checked write.
import { arrangerOf, gqlBlocks, PALETTES, viewerOf, word } from '@thoughtknot/core';
import type { Together } from '@thoughtknot/core';
import {
  boardInFront,
  boardListChanged,
  boardTrail,
  enterBoard,
  glideIn,
  leaveBoard,
  putInFront,
  showBoardList,
} from '@thoughtknot/core/display/board/board-list';
import { boardEditInNote, boardOf, showBoard } from '@thoughtknot/core/display/board/board-view';
import { exchangeBar } from './board-exchange.ts';
import { boardFirst, chooseFirst, firstLine, firstTimeLine, keptIn, starterBoard, withStarter } from './board-first.ts';

/** The page's note as the board needs it: its text now, and its write against the version the page last saw. */
export interface BoardNote {
  readonly text: string;
  writeWhole(text: string): Promise<{ ok: true } | { ok: false; why: string }>;
}

/** What a host of shared boards puts on the page's window before the page starts: the seat of a note's board. */
export interface WithSeats {
  thoughtknotSeat?: (note: string, board: string) => Together | undefined;
  /** Calls the page back once sharing has started, if it ever does, so boards drawn before then take their seats. */
  thoughtknotSeatsReady?: (then: () => void) => void;
}

/**
 * The seat at a shared board, when the host has shared it: the board's name gives its seat, or nothing when it is not
 * shared. The desktop and web apps set it. VS Code's tab and the Obsidian plug-in never do, so they stay offline.
 */
export type SeatFor = (name: string) => Together | undefined;

/** The seats a host put on the page's window for the boards of the note `key`, or none when it put none. */
export function seatsOf(win: Window, key: string): SeatFor | undefined {
  const seat = (win as Window & WithSeats).thoughtknotSeat;
  return seat && ((name) => seat(key, name));
}

/** Asks the host to call `then` once its seats are ready. A host with no shared boards never calls it. */
export function whenSeatsReady(win: Window, then: () => void): void {
  (win as Window & WithSeats).thoughtknotSeatsReady?.(then);
}

/**
 * A section with the note's board in front opened, under the list of its boards, or null when the note holds none.
 * `key` names the note. A board with a seat is edited together with the others there, and the others are drawn on it.
 * `again` draws the section afresh, after another board is put in front.
 */
export function boardSection(
  doc: Document,
  note: BoardNote,
  key: string,
  dark: boolean,
  seatFor?: SeatFor,
  again?: () => void,
): HTMLElement | null {
  const written = gqlBlocks(note.text).filter((b) => boardOf(b.text));
  // a note with graphs and no board opens on a starter board, written to the note only once it is changed
  const starter = written.length ? null : starterBoard(note.text, (t) => !!boardOf(t));
  const boards = starter ? [{ text: starter.text }] : written;
  const names = boards.map((b) => boardOf(b.text)?.name ?? '');
  const name = boardInFront(key, names);
  const b = boards[names.indexOf(name ?? '')];
  if (name === undefined || !b) return null;
  const section = doc.createElement('section');
  section.setAttribute('class', 'gn-boards');
  section.setAttribute('aria-label', word('page.boards'));
  // the note as a change is made to: with its starter board written first, when that is the board shown
  const base = () =>
    starter && !gqlBlocks(note.text).some((x) => boardOf(x.text)) ? withStarter(note.text, starter.text) : note.text;
  const seat = seatFor?.(name);
  showBoardList(section, {
    key,
    names,
    current: name,
    open: () => again?.(),
    change: seat
      ? undefined
      : async (ask) => {
          const r = boardListChanged(base(), name, ask);
          if ('refused' in r) return r.refused;
          const w = await note.writeWhole(r.note);
          if (!w.ok) return w.why;
          putInFront(key, r.name);
          again?.();
          return null;
        },
  });
  const holder = section.appendChild(doc.createElement('div'));
  glideIn(holder, key);
  const own = {
    palette: dark ? PALETTES.dark : PALETTES.light,
    key: `${key}\n${name}`,
  };
  if (seat) {
    showBoard(holder, seat.text(), { ...own, together: seat });
    return section;
  }
  showBoard(holder, b.text, {
    ...own,
    write: async (change) => {
      const r = boardEditInNote(base(), name, change);
      if ('refused' in r) return r;
      const w = await note.writeWhole(r.note);
      return w.ok ? { text: r.text } : { refused: w.why };
    },
    arrange: starter ? undefined : arrangerOf(() => note.text, name),
    views: viewerOf(() => note.text, own.palette),
    // zooming in on a view of a board goes into it, and zooming out comes back (board_nested)
    nest: {
      depth: boardTrail(key).length,
      text: (inner) => boards[names.indexOf(inner)]?.text,
      keyOf: (inner) => `${key}\n${inner}`,
      enter: (inner) => {
        enterBoard(key, name, inner);
        again?.();
      },
      leave: () => {
        leaveBoard(key);
        again?.();
      },
    },
  });
  return section;
}

/** The button that turns the page round: the graph first, or the board first again. */
function firstButton(doc: Document, boardIsFirst: boolean, then: () => void): HTMLElement {
  const b = doc.createElement('button');
  b.setAttribute('type', 'button');
  b.setAttribute('class', 'gn-board-turn');
  b.textContent = word(boardIsFirst ? 'page.board-first.graph' : 'page.board-first.board');
  b.addEventListener('click', then);
  return b;
}

/** Keeps the note's boards in `parent`, first unless the person chose the graph first: each call opens them again. */
export function boardsKept(
  parent: HTMLElement,
  note: BoardNote,
  key: string,
  dark: () => boolean,
  seatFor?: SeatFor,
): () => void {
  let boards: HTMLElement | null = null;
  const kept = keptIn(parent.ownerDocument.defaultView);
  const draw = () => {
    boards?.remove();
    boards = boardSection(parent.ownerDocument, note, key, dark(), seatFor, draw);
    if (!boards) return;
    // whiteboard files in and out: a small bar under the boards, closed until it is opened (board_exchange)
    const win = parent.ownerDocument.defaultView;
    if (win) boards.append(exchangeBar(win, note));
    // the board is the main screen: it comes first, unless this person chose the graph first (board_main_screen)
    const first = boardFirst(kept);
    const turn = (board: boolean) => () => {
      chooseFirst(kept, board);
      draw();
    };
    boards.prepend(firstButton(parent.ownerDocument, first, turn(!first)));
    if (first && firstTimeLine(kept)) boards.prepend(firstLine(parent.ownerDocument, turn(false)));
    if (first) parent.prepend(boards);
    else parent.append(boards);
  };
  // sharing may start after the page first drew: boards drawn before then take their seats once it has
  const win = parent.ownerDocument.defaultView;
  if (win) whenSeatsReady(win, draw);
  return draw;
}
