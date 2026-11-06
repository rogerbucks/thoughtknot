// Where a host keeps the rows of notes read in parts between sessions (editor spec §53, scale_parts_kept). They go in
// the browser's own database (IndexedDB), on this device only. Nothing goes into the vault or the note. Nothing is
// synced. The rows can be thrown away at any time: they cost only a reading.
import type { KeptPlace } from '../../parts-kept.ts';

/** The database and the shelf the rows are kept on. */
const DB = 'thoughtknot-kept-rows';
const SHELF = 'rows';

/** A request's result once it comes, or why not. */
const answer = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((done, fail) => {
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(new Error('IndexedDB refused the request'));
  });

/** The rows kept in `win`'s IndexedDB; undefined where it has none, as in some private windows. */
export function indexedPlace(win: { indexedDB?: IDBFactory }): KeptPlace | undefined {
  const factory = win.indexedDB;
  if (!factory) return undefined;
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (db) return db;
    const asked = factory.open(DB, 1);
    asked.onupgradeneeded = () => void asked.result.createObjectStore(SHELF);
    db = answer(asked);
    db.catch(() => (db = null));
    return db;
  };
  const shelf = async (mode: IDBTransactionMode) => (await open()).transaction(SHELF, mode).objectStore(SHELF);
  return {
    read: async (name) => {
      const kept: unknown = await answer((await shelf('readonly')).get(name));
      return typeof kept === 'string' ? kept : null;
    },
    write: async (name, text) => void (await answer((await shelf('readwrite')).put(text, name))),
    remove: async (name) => void (await answer((await shelf('readwrite')).delete(name))),
  };
}
