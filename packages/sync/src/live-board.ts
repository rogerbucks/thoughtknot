// One person's seat at a board that several people edit at once (editor spec §45, board_live_together). The board is a
// block in a synced note. So every change goes through the note's CRDT, and no server decides what is true. Edits made
// at the same time merge with nothing lost. A change is checked against the person's role first, then written as one
// splice in their name. This is for the desktop and web apps. The Obsidian plugin stays offline and never calls it.
import { accessRefused, boardEditInNote, mayChange } from '@thoughtknot/core';
import type { BoardChange, BoardRole } from '@thoughtknot/core';
import { spliceBetween } from './synced-notes.ts';
import type { SyncedNotes } from './synced-notes.ts';

export class LiveBoard {
  readonly #notes: SyncedNotes;
  readonly #note: string;
  readonly #name: string;
  readonly #person: string;
  readonly #role: BoardRole | null;

  /** `person` seated at the board `name` in `note`, with the `role` the permissions give them. */
  constructor(notes: SyncedNotes, note: string, name: string, person: string, role: BoardRole | null) {
    this.#notes = notes;
    this.#note = note;
    this.#name = name;
    this.#person = person;
    this.#role = role;
  }

  /** Makes `change` as this person. Returns why it was refused, in words, or nothing when it was made. */
  async change(change: BoardChange): Promise<string | undefined> {
    if (!mayChange(this.#role, change)) return accessRefused(this.#role);
    const before = this.#notes.read(this.#note).text;
    const made = boardEditInNote(before, this.#name, change);
    if ('refused' in made) return made.refused;
    const s = spliceBetween(before, made.note);
    const refused = await this.#notes.edit(this.#note, s.from, s.to, s.text, this.#person);
    return refused ? refused.refused.join(' ') : undefined;
  }

  /** Brings in what the other people wrote. Resolves when it is merged. */
  async catchUp(): Promise<void> {
    await this.#notes.sync(this.#note);
  }

  /** The note as this person sees it now. */
  text(): string {
    return this.#notes.read(this.#note).text;
  }
}
