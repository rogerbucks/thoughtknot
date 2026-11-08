// The CRDT, the second of the five layers (editor spec §40, crdt_transport). Roger, 28 Oct 2026 (Q-11 C): each note is
// one upstream Automerge text, and the text stays the one truth. Every edit, from a desktop, a phone or an AI author, is
// a splice of that text, made in the author's name. A device keeps each change it makes as one record in its own file
// of the store, the one layer below. It reads every device's records and merges them, so devices that were apart
// agree once their files have been copied. An anchor is an Automerge cursor, which stays on its character through
// others' edits. So a comment, a details panel or an AI edit still points at its statement.
import * as A from '@automerge/automerge';
import type { Store } from './store.ts';

/** A note as Automerge keeps it. */
export interface NoteDoc {
  text: string;
}

/** A place in a note's text that stays on its character through every device's edits. */
export type Anchor = A.Cursor;

/** Who made a change, kept with it, so a note's history says who wrote what. */
export interface Made {
  author: string;
  device: string;
}

/** The note's first change: the same bytes on every device for the same text, so two devices never start it twice. */
function genesis(text: string): A.Doc<NoteDoc> {
  return A.change(A.init<NoteDoc>({ actor: '00'.repeat(16) }), { time: 0, message: '' }, (d) => {
    d.text = text;
  });
}

/** A device's Automerge actor: the same for the same device name, so its changes always run in one sequence. */
export async function actorOf(device: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`thoughtknot device ${device}`),
  );
  return [...new Uint8Array(hash).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What the layers above need of the CRDT. Two builds have it. This file's runs Automerge here. The app's
 * (remote-crdt.ts) asks Rust, because the app window may not run WebAssembly. What cannot be read from the text alone
 * is asked for with a promise, so either build can answer.
 */
export interface Crdt {
  readonly device: string;
  open(note: string, text?: string): Promise<string>;
  text(note: string): string;
  splice(note: string, from: number, to: number, text: string, author: string): Promise<void>;
  merge(note: string): Promise<{ base: string; ours: string; theirs: string; merged: string } | undefined>;
  hasBeen(note: string, text: string): Promise<boolean>;
  anchor(note: string, place: number): Promise<Anchor>;
  place(note: string, anchor: Anchor): Promise<number>;
  history(note: string): Promise<Made[]>;
}

/** The notes of one device, as Automerge texts kept in `store`. */
export class NoteCrdt implements Crdt {
  readonly #store: Store;
  readonly device: string;
  readonly #docs = new Map<string, A.Doc<NoteDoc>>();
  /** The state of each note this device last merged everything into: the base of its next merge. */
  readonly #merged = new Map<string, A.Heads>();
  #actor = '';
  constructor(store: Store, device: string) {
    this.#store = store;
    this.device = device;
  }

  /** The note `note`, read from every device's records. A note with none yet starts as `text`. */
  async open(note: string, text = ''): Promise<string> {
    this.#actor ||= await actorOf(this.device);
    if (!this.#docs.has(note)) {
      const records = await this.#store.records(note);
      let doc = A.init<NoteDoc>({ actor: this.#actor });
      if (records.length) [doc] = A.applyChanges(doc, records);
      else {
        const first = genesis(text);
        await this.#store.add(note, this.device, A.getLastLocalChange(first)!);
        [doc] = A.applyChanges(doc, A.getAllChanges(first));
      }
      this.#docs.set(note, doc);
      this.#merged.set(note, A.getHeads(doc));
    }
    return this.text(note);
  }

  /** The note's text as merged so far. */
  text(note: string): string {
    return this.#doc(note).text ?? '';
  }

  /** Replaces the text from `from` to `to` by `text`, in `author`'s name, and keeps the change in this device's file. */
  async splice(note: string, from: number, to: number, text: string, author: string): Promise<void> {
    const before = this.#doc(note);
    const made: Made = { author, device: this.device };
    const after = A.change(before, { message: JSON.stringify(made) }, (d) => {
      A.splice(d, ['text'], from, to - from, text);
    });
    for (const change of A.getChanges(before, after)) await this.#store.add(note, this.device, change);
    this.#docs.set(note, after);
  }

  /**
   * Reads every device's records again and merges in the changes this device lacks. It gives the base, ours and
   * theirs. The base is the text both last shared, and ours this device's text before. Nothing, when no change came.
   */
  async merge(note: string): Promise<{ base: string; ours: string; theirs: string; merged: string } | undefined> {
    const before = this.#doc(note);
    const [after] = A.applyChanges(before, await this.#store.records(note));
    // `before` is spent by the apply, so `after` is kept even when nothing new came in
    this.#docs.set(note, after);
    const had = A.getHeads(before);
    if (A.equals(A.getHeads(after), had)) return undefined;
    const base = this.#merged.get(note) ?? [];
    this.#merged.set(note, A.getHeads(after));
    const theirs = A.getHeads(after).filter((h) => !had.includes(h));
    const textAt = (heads: A.Heads) => (A.view(after, heads) as NoteDoc).text ?? '';
    return { base: textAt(base), ours: before.text ?? '', theirs: textAt(theirs), merged: after.text ?? '' };
  }

  /** Whether the note's text was ever `text`: a file with that text is only behind, and holds no edit of its own. */
  hasBeen(note: string, text: string): Promise<boolean> {
    return Promise.resolve(A.getHistory(this.#doc(note)).some((state) => state.snapshot.text === text));
  }

  /** An anchor at `place` in the note's text, which stays on its character through every device's edits. */
  anchor(note: string, place: number): Promise<Anchor> {
    return Promise.resolve(A.getCursor(this.#doc(note), ['text'], place));
  }

  /** Where `anchor` is in the note's text now. */
  place(note: string, anchor: Anchor): Promise<number> {
    return Promise.resolve(A.getCursorPosition(this.#doc(note), ['text'], anchor));
  }

  /** Who made each change of the note, oldest first: the note's first text is no one's. */
  history(note: string): Promise<Made[]> {
    return Promise.resolve(
      A.getHistory(this.#doc(note))
        .map((s) => s.change.message)
        .filter((m): m is string => !!m)
        .map((m) => JSON.parse(m) as Made),
    );
  }

  #doc(note: string): A.Doc<NoteDoc> {
    const doc = this.#docs.get(note);
    if (!doc) throw new Error(`The note ${note} is not open.`);
    return doc;
  }
}
