// The one interface every editor uses (editor spec §40, crdt_transport). Roger, 28 Oct 2026 (Q-11 C). Obsidian, VS
// Code, the desktop app, the phone and AI authors all open, edit and follow a note through it. They point at its
// statements by anchors. It sits on the projection, the layer below, and is the face of the top layer, presentation.
// An edit made outside the editor, by another app or a git pull, is found as one small splice by comparing the texts.
import type { Anchor, Made } from './crdt.ts';
import type { Joined, Refused } from './engine.ts';
import type { Projection, Read } from './projection.ts';

/** A change to a note's text: from `from` to `to`, now `text`. */
export interface Splice {
  from: number;
  to: number;
  text: string;
}

/** What a note's followers are told when its text changes: the change, and the merge's join when it came from one. */
export interface Changed {
  read: Read;
  splice: Splice;
  joined?: Joined;
}

/** The one splice that turns `before` into `after`: what they share at the start and the end is kept. */
export function spliceBetween(before: string, after: string): Splice {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return { from: start, to: before.length - end, text: after.slice(start, after.length - end) };
}

/** One device's synced notes: the stack of five layers, its top face. */
export class SyncedNotes {
  readonly #below: Projection;
  readonly #followers = new Map<string, Set<(c: Changed) => void>>();
  constructor(below: Projection) {
    this.#below = below;
  }

  get device(): string {
    return this.#below.device;
  }

  /** The note, merged from every device's records. A note new to sync starts as `text`, as it is on disk. */
  open(note: string, text?: string): Promise<Read> {
    return this.#below.open(note, text);
  }

  /** Replaces the text from `from` to `to` by `text`, in `author`'s name: refused when it brings in an error. */
  async edit(note: string, from: number, to: number, text: string, author: string): Promise<Refused | undefined> {
    const refused = await this.#below.edit(note, from, to, text, author);
    if (!refused) this.#tell(note, { read: this.#below.read(note), splice: { from, to, text } });
    return refused;
  }

  /** The note's text was changed outside the editor to `text`: kept as one splice in `author`'s name. */
  fromDisk(note: string, text: string, author: string): Promise<Refused | undefined> {
    const s = spliceBetween(this.#below.read(note).text, text);
    return s.from === s.to && !s.text ? Promise.resolve(undefined) : this.edit(note, s.from, s.to, s.text, author);
  }

  /** Merges in what other devices wrote, and tells the note's followers. Nothing when no change came. */
  async sync(note: string): Promise<Joined | undefined> {
    const before = this.#below.read(note).text;
    const joined = await this.#below.merge(note);
    if (joined)
      this.#tell(note, { read: this.#below.read(note), splice: spliceBetween(before, joined.merged), joined });
    return joined;
  }

  /** Calls `follow` each time the note's text changes, here or by a merge. Gives the way to stop. */
  onChange(note: string, follow: (c: Changed) => void): () => void {
    const set = this.#followers.get(note) ?? this.#followers.set(note, new Set()).get(note)!;
    set.add(follow);
    return () => set.delete(follow);
  }

  anchor(note: string, place: number): Anchor {
    return this.#below.anchor(note, place);
  }

  place(note: string, anchor: Anchor): number {
    return this.#below.place(note, anchor);
  }

  read(note: string): Read {
    return this.#below.read(note);
  }

  history(note: string): Made[] {
    return this.#below.history(note);
  }

  #tell(note: string, c: Changed): void {
    for (const f of this.#followers.get(note) ?? []) f(c);
  }
}
