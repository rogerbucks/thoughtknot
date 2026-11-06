// Where the user's graphs are kept, by their choice (editor spec §55, ST1): storage-choice.ts. The setting offers each
// place that passes the storage contract. With no choice made, notes stay where the host keeps them, such as the vault
// (Roger's D2), open offline, and no other place is opened. A move copies every note and checks the copy. Only then is
// the old place let go. A move that fails leaves the new place as it was found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, noteVersion } from '../src/note-storage.ts';
import { historyLayer, layered } from '../src/note-storage.ts';
import { memoryHistory, moveHistory } from '../src/history-store.ts';
import {
  letGoOfOld,
  moveNotes,
  MOVE_REFUSED,
  NO_CHOICE,
  storageInUse,
  storageOffered,
  storageSettingFrom,
} from '../src/storage-choice.ts';

/** A place that must not be opened: the test fails if it is. */
const unopened = (name) => ({
  name,
  title: name,
  checked: true,
  open: () => assert.fail(`the place "${name}" was opened, though not chosen`),
});

/** A note storage that counts its writes and removals. */
function counted(inner = memoryStorage()) {
  const count = { writes: 0, removes: 0 };
  return {
    count,
    storage: {
      list: () => inner.list(),
      read: (p) => inner.read(p),
      write: (p, t, o) => (count.writes++, inner.write(p, t, o)),
      remove: (p, o) => (count.removes++, inner.remove(p, o)),
    },
  };
}

/** A store that loses line endings: it breaks the contract, and a copy into it does not read back. */
function lossy() {
  const inner = memoryStorage();
  return { ...inner, write: (p, t, o) => inner.write(p, t.replaceAll('\r\n', '\n'), o) };
}

test('the setting offers each place that passes the contract, once, and none that fails or is unchecked', async () => {
  const offered = await storageOffered([
    unopened('vault'),
    { name: 'cloud', title: 'A cloud drive', trial: () => memoryStorage(), open: () => assert.fail('opened') },
    { name: 'lossy', title: 'Loses line endings', trial: lossy, open: () => assert.fail('opened') },
    { name: 'unknown', title: 'No check at all', open: () => assert.fail('opened') },
    { name: 'Bad Name', title: 'x', checked: true, open: () => assert.fail('opened') },
    unopened('vault'),
  ]);
  assert.deepEqual(
    offered.map((c) => c.name),
    ['vault', 'cloud'],
  );
});

test('with no choice made, notes are kept where the host keeps them, open and change offline, and no other place is opened', async (t) => {
  const vault = memoryStorage({ 'Ideas.md': '# Ideas\n' });
  const offered = await storageOffered([
    { name: 'vault', title: 'This vault', checked: true, open: () => vault },
    unopened('github'),
    unopened('folder'),
  ]);
  const setting = storageSettingFrom(undefined);
  assert.deepEqual(setting, NO_CHOICE);

  // no network: any reach for it fails the test
  t.mock.method(globalThis, 'fetch', () => assert.fail('the network was used'));
  const inUse = storageInUse(offered, setting, 'vault');
  assert.ok(inUse.ok);
  assert.equal(inUse.choice.name, 'vault');
  assert.equal(inUse.chosen, false);
  const notes = await inUse.choice.open();
  assert.equal((await notes.read('Ideas.md')).text, '# Ideas\n');
  assert.ok((await notes.write('Ideas.md', '# Ideas\n\nMore.\n')).ok);
  assert.equal((await vault.read('Ideas.md')).text, '# Ideas\n\nMore.\n');
});

test('a choice made is used; one no longer there is refused, never quietly swapped for the host place', async () => {
  const offered = await storageOffered([unopened('vault'), unopened('github')]);
  const chosen = storageInUse(offered, storageSettingFrom({ where: 'github', history: 'vault' }), 'vault');
  assert.ok(chosen.ok && chosen.choice.name === 'github' && chosen.chosen);
  const gone = storageInUse(offered, storageSettingFrom({ where: 'cloud' }), 'vault');
  assert.deepEqual(gone, { ok: false, reason: 'chosen-gone', name: 'cloud' });
  assert.deepEqual(storageInUse(offered, NO_CHOICE, 'folder'), { ok: false, reason: 'no-host-place', name: 'folder' });
});

test('a setting not understood is no choice', () => {
  for (const saved of [null, 'vault', [], { where: 3 }, { where: '../x' }, { where: 'Vault' }])
    assert.deepEqual(storageSettingFrom(saved), NO_CHOICE);
});

test('a move copies every note byte for byte and checks it; the old place is not changed until let go', async () => {
  const from = memoryStorage({ 'a.md': 'a\r\n', 'Folder/b.md': 'ünïcödé 😀', 'c.md': 'same' });
  const to = memoryStorage({ 'c.md': 'same', 'Other.md': 'theirs' });
  const elsewhere = counted();
  const before = await from.list();

  const done = await moveNotes(from, to, { author: 'Roger' });
  assert.ok(done.ok, JSON.stringify(done));
  assert.deepEqual(
    done.moved.map((m) => m.path),
    ['Folder/b.md', 'a.md', 'c.md'],
  );
  assert.equal((await to.read('a.md')).text, 'a\r\n');
  assert.equal((await to.read('Folder/b.md')).text, 'ünïcödé 😀');
  assert.equal((await to.read('Other.md')).text, 'theirs', 'a note already there is left alone');
  assert.deepEqual(await from.list(), before, 'the old place is kept until the user lets it go');
  assert.equal(elsewhere.count.writes, 0, 'nothing is written to a place not chosen');

  // the user lets go; a note changed since the move is kept and named
  await from.write('a.md', 'changed after the move');
  const gone = await letGoOfOld(from, done.moved);
  assert.deepEqual(gone, { removed: ['Folder/b.md', 'c.md'], kept: ['a.md'] });
  assert.deepEqual(await from.list(), ['a.md']);
});

test('a move into a place with other text at the same path is refused before anything is written', async () => {
  const from = memoryStorage({ 'a.md': 'mine', 'b.md': 'b' });
  const to = counted(memoryStorage({ 'a.md': 'theirs' }));
  const done = await moveNotes(from, to.storage);
  assert.deepEqual(done, { ok: false, reason: MOVE_REFUSED.clash, paths: ['a.md'] });
  assert.equal(to.count.writes, 0);
});

test('a copy that does not read back is taken back, so the new place is left as it was found', async () => {
  const from = memoryStorage({ 'a.md': 'one\n', 'b.md': 'two\r\n' });
  const to = lossy();
  await to.write('kept.md', 'was here');
  const done = await moveNotes(from, to);
  assert.equal(done.ok, false);
  assert.equal(done.reason, MOVE_REFUSED.copy);
  assert.deepEqual(done.paths, ['b.md']);
  assert.deepEqual(await to.list(), ['kept.md']);
  assert.deepEqual(await from.list(), ['a.md', 'b.md']);
});

test('a note changed in the old place during the move refuses the move, and the copy is taken back', async () => {
  const inner = memoryStorage({ 'a.md': 'one', 'b.md': 'two' });
  let reads = 0;
  // the second time a.md is read, someone has changed it
  const from = {
    ...inner,
    read: async (p) => {
      if (p === 'a.md' && ++reads === 2) await inner.write('a.md', 'changed meanwhile');
      return inner.read(p);
    },
  };
  const to = memoryStorage();
  const done = await moveNotes(from, to);
  assert.deepEqual(done, { ok: false, reason: MOVE_REFUSED.changed, paths: ['a.md'] });
  assert.deepEqual(await to.list(), []);
  assert.equal((await inner.read('a.md')).text, 'changed meanwhile');
});

test('a move to the same place is refused', async () => {
  const s = memoryStorage({ 'a.md': 'x' });
  assert.deepEqual(await moveNotes(s, s), { ok: false, reason: MOVE_REFUSED.same, paths: [] });
});

test('a move keeps the history: the notes move, and the history moves with them to its own place', async () => {
  const history = memoryHistory();
  const from = layered(
    memoryStorage(),
    historyLayer(history, () => '2026-11-06T09:00:00.000Z'),
  );
  await from.write('a.md', 'one', { author: 'Roger' });
  const to = memoryStorage();
  const done = await moveNotes(from, to);
  assert.ok(done.ok);
  assert.equal(done.moved[0].version, noteVersion('one'));
  const newHistory = memoryHistory();
  assert.equal(await moveHistory(history, newHistory), 1);
  assert.deepEqual(await newHistory.changes('a.md'), await history.changes('a.md'));
});
