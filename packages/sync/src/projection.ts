// The projection, the fourth of the five layers (editor spec §40, five_layer_stack). It reads the merged text of the
// engine below and keeps what it read, frozen. That is the derived store, rebuilt each time the text changes
// (crdt_transport). It writes nothing of its own. An edit passes through it to the engine unchanged, so what is
// drawn is always read from the one truth, the text.
import { gqlBlocks, readNote } from '@thoughtknot/core';
import type { NoteReading } from '@thoughtknot/core';
import type { Anchor, Made } from './crdt.ts';
import type { Engine, Joined, Refused } from './engine.ts';

/** One note as read from its merged text. */
export interface Read {
  readonly text: string;
  readonly reading: NoteReading;
}

/** A read-only projection of the engine's notes. */
export class Projection {
  readonly #engine: Engine;
  readonly #reads = new Map<string, Read>();
  constructor(engine: Engine) {
    this.#engine = engine;
  }

  get device(): string {
    return this.#engine.device;
  }

  async open(note: string, text?: string): Promise<Read> {
    await this.#engine.open(note, text);
    return this.read(note);
  }

  /** The note as read from its merged text: read again only when the text has changed. */
  read(note: string): Read {
    const text = this.#engine.text(note);
    const was = this.#reads.get(note);
    if (was?.text === text) return was;
    const read = Object.freeze({ text, reading: readNote(gqlBlocks(text).map((b) => b.text)) });
    this.#reads.set(note, read);
    return read;
  }

  edit(note: string, from: number, to: number, text: string, author: string): Promise<Refused | undefined> {
    return this.#engine.edit(note, from, to, text, author);
  }

  merge(note: string): Promise<Joined | undefined> {
    return this.#engine.merge(note);
  }

  anchor(note: string, place: number): Anchor {
    return this.#engine.anchor(note, place);
  }

  place(note: string, anchor: Anchor): number {
    return this.#engine.place(note, anchor);
  }

  history(note: string): Made[] {
    return this.#engine.history(note);
  }
}
