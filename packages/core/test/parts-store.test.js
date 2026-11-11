// A host can swap the store a note read in parts is kept in (editor spec ES§53, scale_parts_store_swap):
// parts-store.ts. The drawing waits on each read. So a store far away draws the same overview as the one in memory,
// such as a file behind the desktop app's commands. A store whose rows outlast the session needs no other copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MeshIndex, memoryBackend } from '../src/mesh-index.ts';
import { partsStoreOf, storeOver } from '../src/parts-store.ts';
import { storedGraphs } from '../src/store-drawing.ts';
import { contractNote } from '../src/parts-store-contract.ts';

const now = () => Promise.resolve();
/** A note past the read limits, so it is read in parts. */
const text = contractNote(11_000);

/** `store` with each answer given only after a turn of the page, as a store behind a command answers. */
function slow(store) {
  const later =
    (f) =>
    async (...args) => (await new Promise((done) => setImmediate(done)), f(...args));
  return Object.fromEntries(Object.entries(store).map(([k, v]) => [k, typeof v === 'function' ? later(v) : v]));
}

/** What a stored graph draws, as plain data: its things, groups, filters and a group's inside. */
async function drawn(stored) {
  const first = stored.parts.grouping.groups[0];
  return {
    boxes: stored.drawing.boxes,
    grouping: stored.parts.grouping,
    facets: stored.parts.facets(),
    inside: await stored.parts.group(first.id),
    near: await stored.parts.near(first.keys.slice(0, 5)),
    props: await stored.props(first.keys[0]),
  };
}

test('a store that answers later draws the same overview as the store in memory', async () => {
  const here = (await storedGraphs(new MeshIndex(memoryBackend()), 'big.md', text, now)).get('contract');
  const away = (await storedGraphs(slow(storeOver(memoryBackend())), 'big.md', text, now)).get('contract');
  assert.ok(here.parts.grouping.groups.length >= 3);
  assert.deepEqual(await drawn(away), await drawn(here));
});

test('a host that hands in an index keeps one store for it, over its own rows', async () => {
  const ix = new MeshIndex(memoryBackend());
  assert.equal(partsStoreOf(ix), partsStoreOf(ix));
  const store = storeOver(memoryBackend());
  assert.equal(partsStoreOf(store), store);
  ix.update('small.md', contractNote(9));
  assert.equal(await partsStoreOf(ix).version('small.md'), ix.version('small.md'));
});

test('a lasting store keeps no other copy of the rows, and one that is not uses the kept rows', async () => {
  const asked = [];
  const place = {
    read: async (name) => (asked.push(`read ${name}`), null),
    write: async (name) => void asked.push(`write ${name}`),
    remove: async () => undefined,
  };
  await storedGraphs(storeOver(memoryBackend(), true), 'big.md', text, now, place);
  assert.deepEqual(asked, [], 'rows on disk are their own lasting copy');
  await storedGraphs(storeOver(memoryBackend()), 'big.md', text, now, place);
  assert.equal(asked.length, 2, 'rows in memory are kept, as before (scale_parts_kept)');
});

test('the edit pane reads a huge block into the store its host hands it, else into memory', () => {
  const pane = readFileSync(new URL('../src/display/editor/pane-drawing.ts', import.meta.url), 'utf8');
  assert.match(pane, /this\.host\.store\?\.\(\) \?\? storeOver\(memoryBackend\(\)\)/);
  assert.match(pane, /store\?: \(\) => PartsStore;/);
});
