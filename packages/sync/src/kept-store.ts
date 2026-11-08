// A store that keeps its records in any place that keeps values by name (editor spec ES§40, local_encrypted_store). A
// host gives the place: the app's window gives its IndexedDB, a test gives a map. Each value is one device's whole file
// of records for one note, so a device only ever adds to its own, as in every store. Host-free.
import type { Shelf, Store } from './store.ts';

/** A place that keeps lists of records by name. */
export interface Shelves {
  get(name: string): Promise<Uint8Array[] | undefined>;
  put(name: string, records: Uint8Array[]): Promise<void>;
  /** Every name kept. */
  names(): Promise<string[]>;
}

const SPLIT = '\u0000';
const nameOf = (note: string, device: string): string => `${note}${SPLIT}${device}`;

/** A store over `shelves`. */
export class KeptStore implements Store, Shelf {
  readonly #shelves: Shelves;
  /** Writes go one after another, so two adds to one file never lose a record. */
  #turn: Promise<unknown> = Promise.resolve();
  constructor(shelves: Shelves) {
    this.#shelves = shelves;
  }

  add(note: string, device: string, record: Uint8Array): Promise<void> {
    return this.copyIn(note, device, [record]);
  }

  async records(note: string): Promise<Uint8Array[]> {
    const names = (await this.#shelves.names()).filter((n) => n.startsWith(`${note}${SPLIT}`)).sort();
    const files = await Promise.all(names.map((n) => this.#shelves.get(n)));
    return files.flatMap((f) => f ?? []);
  }

  async held(): Promise<Map<string, Map<string, number>>> {
    const out = new Map<string, Map<string, number>>();
    for (const name of await this.#shelves.names()) {
      const [note, device] = name.split(SPLIT) as [string, string];
      const byDevice = out.get(note) ?? out.set(note, new Map()).get(note)!;
      byDevice.set(device, (await this.#shelves.get(name))?.length ?? 0);
    }
    return out;
  }

  async recordsOf(note: string, device: string, from: number): Promise<Uint8Array[]> {
    return ((await this.#shelves.get(nameOf(note, device))) ?? []).slice(from);
  }

  copyIn(note: string, device: string, records: readonly Uint8Array[]): Promise<void> {
    const name = nameOf(note, device);
    const done = this.#turn.then(async () => {
      const mine = (await this.#shelves.get(name)) ?? [];
      await this.#shelves.put(name, [...mine, ...records.map((r) => r.slice())]);
    });
    this.#turn = done.catch(() => undefined);
    return done;
  }
}
