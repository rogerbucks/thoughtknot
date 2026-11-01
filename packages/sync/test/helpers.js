// What the sync tests share: a note with a graph, and devices that copy each other's files as Syncthing does.
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MemoryStore, VaultKey, syncedOver } from '../src/index.ts';

export const NOTE = 'Shop.md';
export const TEXT = "# Shop\n\n```gql\n// graph: shop\n(w:Product {name: 'Widget', price: 10})\n```\n";

/** `names` devices of one owner, each with its own folder, sharing one vault key. */
export async function devices(...names) {
  const key = await VaultKey.create();
  return names.map((name) => {
    const store = new MemoryStore();
    return { name, store, notes: syncedOver(store, key, name) };
  });
}

/** Copies every device's files to every other: Syncthing, run once all are back online. */
export function copyAll(all) {
  for (const a of all) for (const b of all) if (a !== b) a.store.copyFrom(b.store);
}

/** Where `text` starts in `within`. Throws when it is not there, so a test never edits the wrong place. */
export function at(within, text) {
  const i = within.indexOf(text);
  if (i < 0) throw new Error(`${text} is not in the note`);
  return i;
}

/** The files of the folder `root`, as a desktop host gives them to a folder store. */
export const nodeFiles = (root) => ({
  async append(path, bytes) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await appendFile(join(root, path), bytes);
  },
  read: async (path) => new Uint8Array(await readFile(join(root, path))),
  list: (path) => readdir(join(root, path)).catch(() => []),
});
