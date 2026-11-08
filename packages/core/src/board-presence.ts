// Who else is on a board right now (editor spec §45, board_presence). Each person has a pointer, a selection and a
// name. Presence is live and kept apart from the note: nothing here reads or writes the board's text, so it can never
// reach the note. Each person is marked by a shape and an initial as well as a colour. Pure and host-free.
import type { Board } from './board.ts';
import { itemBox } from './board-svg.ts';
import { word } from './words.ts';

/** One person on the board: where their pointer is, what they have selected, and when they were last heard from. */
export interface Peer {
  id: string;
  name: string;
  pointer?: [number, number];
  selection: string[];
  seen: number;
}

/** The shapes that tell people apart without colour, handed out in turn. */
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross'] as const;
/** How long, in milliseconds, a person stays on the board without a sign of life. */
export const STALE = 30_000;

/** A person's mark: a shape and the first letter of the name, the same for everyone who looks. */
export interface Mark {
  shape: (typeof SHAPES)[number];
  initial: string;
}

/** The people heard from lately, in a fixed order, without `me`. */
export function others(peers: Peer[], me: string, now: number): Peer[] {
  return peers.filter((p) => p.id !== me && now - p.seen <= STALE).sort((a, b) => a.id.localeCompare(b.id));
}

/** The mark of each person among `peers`: by their place in the fixed order, so it holds from one screen to the next. */
export function marks(peers: Peer[]): Map<string, Mark> {
  const order = [...peers].sort((a, b) => a.id.localeCompare(b.id));
  return new Map(
    order.map((p, i) => [
      p.id,
      { shape: SHAPES[i % SHAPES.length] ?? SHAPES[0], initial: ([...p.name][0] ?? '?').toUpperCase() },
    ]),
  );
}

/** The spot to bring into view to follow a person: their pointer, else the middle of what they have selected. */
export function followSpot(board: Board, peer: Peer): [number, number] | null {
  if (peer.pointer) return peer.pointer;
  const boxes = board.items.filter((i) => peer.selection.includes(i.id)).map(itemBox);
  if (!boxes.length) return null;
  const x = boxes.reduce((sum, b) => sum + b.x + b.w / 2, 0) / boxes.length;
  const y = boxes.reduce((sum, b) => sum + b.y + b.h / 2, 0) / boxes.length;
  return [Math.round(x), Math.round(y)];
}

/** Who is here, in words for a screen reader, with what each has selected. */
export function presenceSaid(peers: Peer[]): string {
  if (!peers.length) return word('board.presence.alone');
  return peers
    .map((p) =>
      p.selection.length
        ? word('board.presence.selecting', { name: p.name, items: p.selection.join(', ') })
        : word('board.presence.here', { name: p.name }),
    )
    .join('. ');
}
