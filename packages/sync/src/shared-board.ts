// A shared board across devices (editor spec §45, board_live_together, board_presence). A seat at the board (`BoardSeat`)
// is joined to a `Link` to the other devices. The link is whatever carries bytes between them: the mesh VPN in the
// apps, memory in a test. After this person changes the board, the link sends the new records, so the others see the
// change at once. When the others' records arrive, the seat catches up and the screen redraws that change alone.
// Presence goes over the same link as short messages, and is never written to the note.
import type { BoardRole } from '@thoughtknot/core';
import type { BoardChange } from '@thoughtknot/core';
import { BoardSeat } from './board-seat.ts';
import type { Who } from './board-seat.ts';
import { LiveBoard } from './live-board.ts';
import type { SyncedNotes } from './synced-notes.ts';

/** A link to the other devices at the board. */
export interface Link {
  /** Sends the records the others lack and takes in the records this device lacks. */
  exchange(): Promise<void>;
  /** Sends a presence message to the others. */
  send(message: string): void;
  /** `heard` gets each presence message from another device. `arrived` is told when their records have come in. */
  listen(heard: (message: string) => void, arrived: () => void): void;
}

/** A seat that sends its changes at once over a link. */
class LinkedSeat extends BoardSeat {
  readonly #link: Link;
  constructor(live: LiveBoard, board: string, who: Who, link: Link) {
    super(live, board, who, (m) => link.send(m));
    this.#link = link;
  }

  override async change(change: BoardChange): Promise<string | undefined> {
    const refused = await super.change(change);
    // a change refused by the person's role was never made, so there is nothing to send
    if (!refused) await this.#link.exchange();
    return refused;
  }
}

/** `who`'s seat at the board `board` in `note`, with the `role` the permissions give them, joined to `link`. */
export function sharedBoard(
  notes: SyncedNotes,
  note: string,
  board: string,
  who: Who,
  role: BoardRole | null,
  link: Link,
): BoardSeat {
  const seat = new LinkedSeat(new LiveBoard(notes, note, board, who.id, role), board, who, link);
  link.listen(
    (m) => void seat.hear(m),
    () => void seat.catchUp(),
  );
  return seat;
}
