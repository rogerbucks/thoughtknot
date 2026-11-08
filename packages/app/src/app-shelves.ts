// Where the app keeps its shared notes' records between runs (editor spec ES§40, local_encrypted_store). They go in the
// window's own database (IndexedDB), on this device only, as sealed records: the vault key is not here. A value is one
// device's whole file of records for one note, as `KeptStore` asks. Where the window has no database, none.
import type { Shelves } from '@thoughtknot/sync/remote';

const DB = 'thoughtknot-notes';
const SHELF = 'records';

/** A request's result once it comes, or why not. */
const answer = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((done, fail) => {
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error ?? new Error());
  });

/** The records kept in `win`'s IndexedDB; undefined where it has none, as in some private windows. */
export function indexedShelves(win: { indexedDB?: IDBFactory }): Shelves | undefined {
  const factory = win.indexedDB;
  if (!factory) return undefined;
  const open = () => {
    const asked = factory.open(DB, 1);
    asked.onupgradeneeded = () => void asked.result.createObjectStore(SHELF);
    return answer(asked);
  };
  const shelf = async (mode: IDBTransactionMode) => (await open()).transaction(SHELF, mode).objectStore(SHELF);
  return {
    get: async (name) => (await answer((await shelf('readonly')).get(name))) as Uint8Array[] | undefined,
    put: async (name, records) => void (await answer((await shelf('readwrite')).put(records, name))),
    names: async () => (await answer((await shelf('readonly')).getAllKeys())) as string[],
  };
}
