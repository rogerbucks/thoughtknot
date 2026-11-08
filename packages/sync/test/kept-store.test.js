// A store over any place that keeps lists by name (editor spec ES§40, local_encrypted_store). It keeps what it is given
// across runs. It loses no record when two are added at once. It sends and takes in records as a shelf does.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { KeptStore } from '../src/index.ts';

/** A place that keeps lists by name, as the window's database does. */
function place() {
  const kept = new Map();
  return {
    kept,
    get: async (name) => kept.get(name),
    put: async (name, records) => void kept.set(name, records),
    names: async () => [...kept.keys()],
  };
}

const bytes = (...b) => Uint8Array.from(b);

describe('a kept store', () => {
  // proves: local_encrypted_store
  test('keeps its records across runs and gives them back by note', async () => {
    const shelves = place();
    const first = new KeptStore(shelves);
    await first.add('Shop.md', 'laptop', bytes(1));
    await first.add('Shop.md', 'phone', bytes(2));
    await first.add('Other.md', 'laptop', bytes(3));
    const later = new KeptStore(shelves);
    assert.deepEqual(
      (await later.records('Shop.md')).map((r) => [...r]),
      [[1], [2]],
    );
    assert.deepEqual(
      [...(await later.held()).get('Shop.md')],
      [
        ['laptop', 1],
        ['phone', 1],
      ],
    );
  });

  // proves: local_encrypted_store
  test('loses no record when several are added at once', async () => {
    const store = new KeptStore(place());
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.add('Shop.md', 'laptop', bytes(n))));
    assert.deepEqual(
      (await store.recordsOf('Shop.md', 'laptop', 0)).map((r) => r[0]),
      [1, 2, 3, 4, 5],
    );
  });

  // proves: mesh_vpn_sync
  test('sends the records the other lacks and takes in a copy of another device’s file', async () => {
    const [a, b] = [new KeptStore(place()), new KeptStore(place())];
    await a.add('Shop.md', 'laptop', bytes(1));
    await a.add('Shop.md', 'laptop', bytes(2));
    await b.copyIn('Shop.md', 'laptop', await a.recordsOf('Shop.md', 'laptop', 0));
    assert.deepEqual(
      (await b.recordsOf('Shop.md', 'laptop', 1)).map((r) => [...r]),
      [[2]],
    );
  });
});
