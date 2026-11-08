// One person's seat at a shared board, as the board screen uses it (editor spec §45, board_live_together,
// board_presence). The screen reads the board and makes changes through the CRDT (`LiveBoard`), and the others are
// told where this person is. A person's place is live and is never written to the note. What arrives from another
// device is data: each part is checked, and a long name or a long list is cut short. This is for the desktop and web
// apps. The Obsidian plug-in stays offline and never calls it.
import { boardBlockIn } from '@thoughtknot/core';
import type { BoardChange, Here, Peer, Together } from '@thoughtknot/core';
import type { LiveBoard } from './live-board.ts';

const MOST_SELECTED = 50;
const MOST_CHARS = 64;

/** Who this person is among the people at the board: an id no one else has, and the name the others see. */
export interface Who {
  id: string;
  name: string;
}

/** A piece of text from outside, kept to a name's length, or nothing when it is not text or is empty. */
const cut = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? [...v].slice(0, MOST_CHARS).join('') : undefined;

export class BoardSeat implements Together {
  readonly me: string;
  readonly #live: LiveBoard;
  readonly #name: string;
  readonly #board: string;
  readonly #peers = new Map<string, Peer>();
  readonly #watchers = new Set<() => boolean>();
  readonly #send: (message: string) => void;
  readonly #now: () => number;
  #here: Here = { selection: [] };

  /** The seat of `who` at the board `board` that `live` edits; `send` carries a message to the other devices. */
  constructor(live: LiveBoard, board: string, who: Who, send: (message: string) => void, now = Date.now) {
    this.#live = live;
    this.#board = board;
    this.me = who.id;
    this.#name = who.name;
    this.#send = send;
    this.#now = now;
  }

  peers(): Peer[] {
    return [{ id: this.me, name: this.#name, ...this.#here, seen: this.#now() }, ...this.#peers.values()];
  }

  announce(here: Here): void {
    this.#here = here;
    this.#send(JSON.stringify({ here: { id: this.me, name: this.#name, ...here } }));
  }

  watch(changed: () => boolean): void {
    this.#watchers.add(changed);
  }

  /** The board block as it is now; empty when the note has lost the board. */
  text(): string {
    return boardBlockIn(this.#live.text(), this.#board) ?? '';
  }

  async change(change: BoardChange): Promise<string | undefined> {
    const refused = await this.#live.change(change);
    if (!refused) this.#tell();
    return refused;
  }

  /** Brings in what the other people wrote, then tells the screen. */
  async catchUp(): Promise<void> {
    await this.#live.catchUp();
    this.#tell();
  }

  /** Says goodbye, so the others stop showing this person at once. */
  leave(): void {
    this.#send(JSON.stringify({ gone: this.me }));
  }

  /** A message from another device. Whether it was a sign of life or of leaving that was understood. */
  hear(message: string): boolean {
    const m = this.#parsed(message);
    if (!m) return false;
    if ('gone' in m) this.#peers.delete(m.gone);
    else this.#peers.set(m.here.id, { ...m.here, seen: this.#now() });
    this.#tell();
    return true;
  }

  /** What a message says, or nothing when it is not a well-formed sign from someone else. */
  #parsed(message: string): { gone: string } | { here: Omit<Peer, 'seen'> } | undefined {
    let m: unknown;
    try {
      m = JSON.parse(message);
    } catch {
      return undefined;
    }
    const o = m as { gone?: unknown; here?: Record<string, unknown> };
    const gone = cut(o?.gone);
    if (gone && gone !== this.me) return { gone };
    const h = o?.here;
    const id = cut(h?.id),
      name = cut(h?.name);
    if (!h || !id || !name || id === this.me || !Array.isArray(h.selection)) return undefined;
    const selection = h.selection
      .map(cut)
      .filter((s): s is string => !!s)
      .slice(0, MOST_SELECTED);
    const p = h.pointer;
    const pointer =
      Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n))
        ? ([p[0], p[1]] as [number, number])
        : undefined;
    return { here: { id, name, selection, ...(pointer ? { pointer } : {}) } };
  }

  #tell(): void {
    for (const w of this.#watchers) if (!w()) this.#watchers.delete(w);
  }
}
