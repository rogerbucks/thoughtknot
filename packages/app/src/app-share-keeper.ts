// Where the app keeps its sharing keys between runs (editor spec §45, board_access). They go in the window's own
// database (IndexedDB), on this device only. The private key is made unexportable, so what is kept is a handle that
// only this window can use. The vault key is kept only sealed for this device. Nothing goes in a note or a vault.
import type { Kept, Keeper } from '@thoughtknot/sync/sharing';

const DB = 'thoughtknot-sharing';
const SHELF = 'keys';
const ROW = 'this-device';

/** A request's result once it comes, or why not. */
const answer = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((done, fail) => {
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error ?? new Error());
  });

/** The sharing keys kept in `win`'s IndexedDB; undefined where it has none, as in some private windows. */
export function indexedKeeper(win: { indexedDB?: IDBFactory }): Keeper | undefined {
  const factory = win.indexedDB;
  if (!factory) return undefined;
  const open = () => {
    const asked = factory.open(DB, 1);
    asked.onupgradeneeded = () => void asked.result.createObjectStore(SHELF);
    return answer(asked);
  };
  const shelf = async (mode: IDBTransactionMode) => (await open()).transaction(SHELF, mode).objectStore(SHELF);
  return {
    load: async () => ((await answer((await shelf('readonly')).get(ROW))) as Kept | undefined) ?? null,
    save: async (kept) => void (await answer((await shelf('readwrite')).put(kept, ROW))),
  };
}
