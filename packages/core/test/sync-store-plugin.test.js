// A plug-in adds a place the sealed records of a shared vault are kept (editor spec ES§40, five_layer_stack). The
// registry holds it under its word, and the contract refuses a store that does not give every record back as it was.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { syncStoreBackendContract } from '../src/plugins-contract.ts';
import { POINT_VERSIONS } from '../src/plugin-versions.ts';

/** A store in memory: each note holds one list of records per device. */
function memoryRecords() {
  const notes = new Map();
  const file = (n, d) => {
    if (!notes.has(n)) notes.set(n, new Map());
    if (!notes.get(n).has(d)) notes.get(n).set(d, []);
    return notes.get(n).get(d);
  };
  return {
    add: async (n, d, r) => void file(n, d).push(Uint8Array.from(r)),
    records: async (n) => [...(notes.get(n)?.values() ?? [])].flat(),
    held: async () => new Map([...notes].map(([n, m]) => [n, new Map([...m].map(([d, l]) => [d, l.length]))])),
    recordsOf: async (n, d, from) => file(n, d).slice(from),
    copyIn: async (n, d, rs) => void file(n, d).push(...rs.map((r) => Uint8Array.from(r))),
  };
}
const bucket = { name: 'bucket', title: 'Bucket', open: memoryRecords };
const plugin = (b) => ({
  id: 'acme.bucket',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['syncstore'],
  register: (points) => points.syncstore.add(b),
});

describe('a record store a plug-in adds', () => {
  test('it is versioned, offered under its word, and opened for use', () => {
    assert.equal(POINT_VERSIONS.syncstore, '1.0');
    const registry = pluginRegistry();
    registry.register(plugin(bucket));
    assert.deepEqual(
      registry.syncStores().map((b) => b.name),
      ['bucket'],
    );
    assert.equal(typeof registry.openSyncStore('bucket').value?.add, 'function');
  });

  test('one with a name that is not a word, a name taken, or no way to open it is refused', () => {
    const registry = pluginRegistry();
    registry.register(plugin(bucket));
    const refused = [
      { ...plugin({ ...bucket, name: 'Bad Name' }), id: 'acme.bad' },
      { ...plugin(bucket), id: 'acme.again' },
      { ...plugin({ ...bucket, name: 'shut', open: undefined }), id: 'acme.shut' },
    ];
    for (const p of refused) assert.throws(() => registry.register(p), /was not installed/);
    assert.deepEqual(
      registry.syncStores().map((b) => b.name),
      ['bucket'],
    );
  });

  test('it passes every check of the record store contract', async () => {
    for (const check of syncStoreBackendContract(bucket)) await check.run();
  });

  test('a store that loses a record, or keeps records from one opening to the next, fails a check', async () => {
    const lossy = () => ({ ...memoryRecords(), records: async () => [] });
    const kept = memoryRecords();
    await kept.add('n', 'a', Uint8Array.from([9]));
    for (const open of [lossy, () => kept]) {
      const failed = [];
      for (const check of syncStoreBackendContract({ ...bucket, open }))
        await check.run().catch((e) => failed.push(e.message));
      assert.ok(failed.length > 0);
    }
  });
});
