// The store, the bottom of the five layers (editor spec §40, five_layer_stack). Roger, 28 Oct 2026 (Q-11 C, Q-12 B).
// It keeps records, each in one device's file for one note. A device only ever adds to its own file. So no file that
// Syncthing copies between devices is written by two, and it never makes a conflict copy. The layer above (the
// CRDT, crdt.ts) talks to this interface alone, so a store is swapped with no change above it. Host-free.

/** Where records are kept: each note's records, in one file for each device that wrote them. */
export interface Store {
  /** Adds `record` to the end of `device`'s file for `note`. A device writes only its own file. */
  add(note: string, device: string, record: Uint8Array): Promise<void>;
  /** Every record of `note`, from every device's file, each file in the order it was written. */
  records(note: string): Promise<Uint8Array[]>;
}

/**
 * What a store holds, file by file, so two devices can send each other what one lacks (mesh_vpn_sync). Its names are
 * as the store keeps them: hidden, under a sealed store. Its records are as kept: sealed.
 */
export interface Shelf {
  /** How many records each device's file of each note holds: by note, then by device. */
  held(): Promise<Map<string, Map<string, number>>>;
  /** The records of `device`'s file for `note`, from the `from`th on. */
  recordsOf(note: string, device: string, from: number): Promise<Uint8Array[]>;
  /** Adds `records` to `device`'s file for `note`, as a copy of that device's own file. */
  copyIn(note: string, device: string, records: readonly Uint8Array[]): Promise<void>;
}

/** A store held in memory: for tests, and for a device that keeps nothing on disk. */
export class MemoryStore implements Store, Shelf {
  /** Each note's files, by device. */
  readonly files = new Map<string, Map<string, Uint8Array[]>>();

  add(note: string, device: string, record: Uint8Array): Promise<void> {
    const byDevice = this.files.get(note) ?? this.files.set(note, new Map()).get(note)!;
    byDevice.set(device, [...(byDevice.get(device) ?? []), record.slice()]);
    return Promise.resolve();
  }

  records(note: string): Promise<Uint8Array[]> {
    return Promise.resolve([...(this.files.get(note)?.values() ?? [])].flat());
  }

  held(): Promise<Map<string, Map<string, number>>> {
    const out = new Map<string, Map<string, number>>();
    for (const [note, byDevice] of this.files)
      out.set(note, new Map([...byDevice].map(([device, records]) => [device, records.length])));
    return Promise.resolve(out);
  }

  recordsOf(note: string, device: string, from: number): Promise<Uint8Array[]> {
    return Promise.resolve((this.files.get(note)?.get(device) ?? []).slice(from));
  }

  async copyIn(note: string, device: string, records: readonly Uint8Array[]): Promise<void> {
    for (const r of records) await this.add(note, device, r);
  }

  /** Copies every file this store lacks, or holds shorter, from `other`: what Syncthing does between two folders. */
  copyFrom(other: MemoryStore): void {
    for (const [note, byDevice] of other.files)
      for (const [device, records] of byDevice) {
        const mine = this.files.get(note) ?? this.files.set(note, new Map()).get(note)!;
        if ((mine.get(device)?.length ?? 0) < records.length) mine.set(device, [...records]);
      }
  }
}

/** `records` as the bytes of one file: each record after its length, four bytes, most significant first. */
export function framed(records: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(records.reduce((n, r) => n + 4 + r.length, 0));
  let at = 0;
  for (const r of records) {
    new DataView(out.buffer).setUint32(at, r.length);
    out.set(r, at + 4);
    at += 4 + r.length;
  }
  return out;
}

/** The records of one file's bytes. A record cut short, as by a copy still under way, is left for the next read. */
export function unframed(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 4 <= bytes.length;) {
    const n = view.getUint32(at);
    if (at + 4 + n > bytes.length) break;
    out.push(bytes.slice(at + 4, at + 4 + n));
    at += 4 + n;
  }
  return out;
}
