// Where graphs are kept: what was saved for it, read back (ES§55, storage_history_layer). The settings page itself,
// with the plug-in loaded, is in storage-settings-page.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layered, memoryStorage } from '@thoughtknot/core';
import {
  HISTORY_FOLDER,
  STORAGE_KEY,
  historyFolderOf,
  keepStorage,
  keptStorageFrom,
  setStorageValue,
  storageGroup,
  storageLayers,
  storageStoreOf,
  storageValue,
} from '../src/storage/storage-settings.ts';

test('what was saved is read back: anything not understood is off, and a folder notes cannot be kept in is the default', () => {
  assert.deepEqual(keptStorageFrom(undefined), { history: 'off', historyFolder: '' });
  assert.deepEqual(keptStorageFrom({ history: 'yes', historyFolder: 3 }), { history: 'off', historyFolder: '' });
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '' }), HISTORY_FOLDER);
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '.obsidian' }), HISTORY_FOLDER);
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '../out' }), HISTORY_FOLDER);
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '/Notes/Changes/' }), 'Notes/Changes');
});

/** A plug-in's saved data, held in memory. */
function savedStore(saved = {}) {
  let now = saved;
  return { get: () => now, set: (next) => (now = next) };
}

test('each row of the group reads and saves its own setting, and nothing else in the data', () => {
  const group = storageGroup();
  const keys = group.items.map((item) => item.control?.key).filter(Boolean);
  assert.deepEqual(keys, [`${STORAGE_KEY}history`, `${STORAGE_KEY}historyFolder`]);
  const store = savedStore({ settings: { decider: 'Roger' } });
  assert.equal(storageValue(store, keys[0]), 'off');
  setStorageValue(store, keys[0], 'on');
  setStorageValue(store, keys[1], ' Changes ');
  assert.deepEqual(store.get(), {
    settings: { decider: 'Roger' },
    storage: { history: 'on', historyFolder: 'Changes' },
  });
  assert.equal(storageValue(store, keys[1]), 'Changes');
});

test('the layers keep nothing until the plug-in has loaded and who changed what is turned on', async () => {
  const app = {};
  assert.deepEqual(
    storageLayers(app, () => memoryStorage()),
    [],
    'no plug-in loaded',
  );
  keepStorage(undefined, savedStore());
  const store = savedStore();
  keepStorage({ app }, store);
  assert.equal(storageStoreOf(app), store);
  assert.deepEqual(
    storageLayers(app, () => memoryStorage()),
    [],
    'off',
  );

  store.set({ settings: { decider: 'Roger' }, storage: { history: 'on', historyFolder: 'Changes' } });
  const vault = memoryStorage();
  const notes = layered(vault, ...storageLayers(app, () => vault));
  await notes.write('A.md', 'one\n', { expected: null });
  const [kept] = (await vault.list()).filter((p) => p.startsWith('Changes/'));
  const text = (await vault.read(kept)).text;
  const change = JSON.parse(text.split('\n')[text.split('\n').indexOf('```json thoughtknot-change') + 1]);
  assert.deepEqual(
    { path: change.path, after: change.after, author: change.author },
    {
      path: 'A.md',
      after: 'one\n',
      author: 'Roger',
    },
  );
  const now = (await notes.read('A.md')).version;
  assert.equal((await notes.remove('A.md', { expected: now })).ok, true);
  assert.deepEqual(
    (await notes.list()).filter((p) => !p.startsWith('Changes/')),
    [],
  );
});
