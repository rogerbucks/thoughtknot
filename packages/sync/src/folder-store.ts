// A store in a folder that Syncthing shares between an owner's devices (editor spec §40, local_encrypted_store). Each
// note is a folder, and each device's records for it one file there, so no two devices write one file. Records are
// framed by their length (store.ts). A file still being copied in reads up to its last whole record. The host gives
// the way to reach its files: Node's on a desktop, the vault's in Obsidian. So the store itself is host-free.
import { framed, unframed } from './store.ts';
import type { Shelf, Store } from './store.ts';

/** The ending of a device's file of records. */
export const RECORDS_FILE = '.tkrec';

/** What a host gives a folder store: its files, by paths under the shared folder, split by `/`. */
export interface FolderFiles {
  /** Adds `bytes` to the end of the file at `path`, making it and its folder when they are not there. */
  append(path: string, bytes: Uint8Array): Promise<void>;
  /** The bytes of the file at `path`. */
  read(path: string): Promise<Uint8Array>;
  /** The names in the folder at `path`, or none when it is not there. */
  list(path: string): Promise<string[]>;
}

/** A store in a shared folder: `<note>/<device>.tkrec`. */
export class FolderStore implements Store, Shelf {
  readonly #files: FolderFiles;
  constructor(files: FolderFiles) {
    this.#files = files;
  }

  async add(note: string, device: string, record: Uint8Array): Promise<void> {
    await this.#files.append(`${safe(note)}/${safe(device)}${RECORDS_FILE}`, framed([record]));
  }

  async records(note: string): Promise<Uint8Array[]> {
    const names = (await this.#files.list(safe(note))).filter((n) => n.endsWith(RECORDS_FILE)).sort();
    const files = await Promise.all(names.map((n) => this.#files.read(`${safe(note)}/${n}`)));
    return files.flatMap((b) => unframed(b));
  }

  async held(): Promise<Map<string, Map<string, number>>> {
    const out = new Map<string, Map<string, number>>();
    for (const folder of await this.#files.list('')) {
      const names = (await this.#files.list(folder)).filter((n) => n.endsWith(RECORDS_FILE));
      const counts = await Promise.all(
        names.map(async (n) => unframed(await this.#files.read(`${folder}/${n}`)).length),
      );
      out.set(unsafe(folder), new Map(names.map((n, i) => [unsafe(n.slice(0, -RECORDS_FILE.length)), counts[i] ?? 0])));
    }
    return out;
  }

  async recordsOf(note: string, device: string, from: number): Promise<Uint8Array[]> {
    const names = await this.#files.list(safe(note));
    const file = `${safe(device)}${RECORDS_FILE}`;
    return names.includes(file) ? unframed(await this.#files.read(`${safe(note)}/${file}`)).slice(from) : [];
  }

  async copyIn(note: string, device: string, records: readonly Uint8Array[]): Promise<void> {
    await this.#files.append(`${safe(note)}/${safe(device)}${RECORDS_FILE}`, framed(records));
  }
}

/** `name` as one folder or file name: anything but a letter, digit, `_` or `-` written as `~` and four hex digits. */
const safe = (name: string): string =>
  name.replace(/[^A-Za-z0-9_-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
/** The name `safe` wrote as `written`. */
const unsafe = (written: string): string =>
  written.replace(/~([0-9a-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
