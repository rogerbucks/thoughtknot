// The contract of the record store point (editor spec ES§40, five_layer_stack). It is kept apart from the other points'
// contracts so no source file grows past its size. Like them, its checks need no test framework.
import type { SyncStoreBackend } from './plugins.ts';
import type { StorageCheck } from './storage-contract.ts';
import { readsInHostDirection } from './plugins-contract.ts';

/** Fails a check with what was wanted and what the store did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** The two records every record-store check writes, so a store is tried on bytes it must give back as they were. */
const SEALED = [Uint8Array.from([1, 2, 3]), Uint8Array.from([255, 0, 7])];
const asList = (rs: Uint8Array[]): string => JSON.stringify(rs.map((r) => [...r]));

/**
 * Every check a record store is held to (ES§40, five_layer_stack). The records are bytes it cannot read, so it must give
 * back each one as it was, each device's file in the order written. It opens a store afresh for each check, empty.
 */
export function syncStoreBackendContract(b: SyncStoreBackend): StorageCheck[] {
  const title = readsInHostDirection(b.name, b.title);
  return [
    {
      name: 'a new store holds no record',
      run: async () => {
        const got = await b.open().records('n');
        if (got.length) fail(b.name, 'no record', got.length);
      },
    },
    {
      name: 'records read back byte for byte, in the order written',
      run: async () => {
        const s = b.open();
        for (const r of SEALED) await s.add('n', 'a', r);
        const got = await s.records('n');
        if (asList(got) !== asList(SEALED)) fail(b.name, asList(SEALED), asList(got));
      },
    },
    {
      name: 'it says how many records each device’s file holds, and gives a file from a place on',
      run: async () => {
        const s = b.open();
        await s.add('n', 'a', SEALED[0]!);
        await s.copyIn('n', 'a', [SEALED[1]!]);
        const held = (await s.held()).get('n')?.get('a');
        if (held !== 2) fail(b.name, 'two held', held);
        const tail = await s.recordsOf('n', 'a', 1);
        if (asList(tail) !== asList([SEALED[1]!])) fail(b.name, 'the second record', asList(tail));
      },
    },
    { name: title.name, run: async () => title.run() },
  ];
}
