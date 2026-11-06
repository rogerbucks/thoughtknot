// The history of every change is its own layer, apart from where the notes are kept (editor spec §55,
// storage_history_layer): history-store.ts. Each history store passes the one history contract: memory, and notes in
// any note storage, here memory and a GitHub repository. Each keeps who made each change. Swapping one for another
// leaves the current copy of every note as it was.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { historyLayer, layered, memoryStorage } from '../src/note-storage.ts';
import { githubRepoStorage } from '../src/github-repo-store.ts';
import { memoryHistory, moveHistory, notesHistory } from '../src/history-store.ts';
import { historyContract } from '../src/history-contract.ts';
import { fakeGitHub, repoOptions } from './fake-github.js';

const stores = {
  memory: () => memoryHistory(),
  'notes in memory': () => notesHistory(memoryStorage()),
  'notes in a GitHub repository': () => notesHistory(githubRepoStorage(repoOptions(fakeGitHub()))),
};

// proves: storage_history_layer
for (const [name, make] of Object.entries(stores)) {
  describe(`the history contract: ${name}`, () => {
    for (const check of historyContract(make)) test(check.name, check.run);
  });
}

test('history kept as notes reads back when opened again, and a person can read it as notes', async () => {
  const where = memoryStorage();
  await notesHistory(where).record({
    path: 'a.md',
    before: null,
    after: 'x',
    author: 'Roger',
    at: '2026-11-06T09:00:00Z',
  });
  const again = await notesHistory(where).changes();
  assert.deepEqual(again, [{ path: 'a.md', before: null, after: 'x', author: 'Roger', at: '2026-11-06T09:00:00Z' }]);
  assert.deepEqual(await where.list(), ['History/2026-11-06.md']);
  assert.match((await where.read('History/2026-11-06.md')).text, /^# Changes on 2026-11-06\n/);
});

test('a block edited by hand into something else is left out, and the rest still read', async () => {
  const where = memoryStorage({ 'History/2026-11-06.md': '```json thoughtknot-change\nnot json\n```\n' });
  const h = notesHistory(where);
  await h.record({ path: 'a.md', before: null, after: 'x', at: '2026-11-06T09:00:00Z' });
  assert.deepEqual(
    (await h.changes()).map((c) => c.path),
    ['a.md'],
  );
});

test('the history store is swapped without changing the current copy of any note', async () => {
  const notes = memoryStorage();
  const first = memoryHistory();
  const second = notesHistory(memoryStorage());
  let tick = 0;
  const now = () => `2026-11-06T10:00:0${tick++}.000Z`;
  await layered(notes, historyLayer(first, now)).write('n.md', 'one', { author: 'Roger' });
  const before = await notes.read('n.md');

  // the history moves to its new place, and the notes are untouched
  assert.equal(await moveHistory(first, second), 1);
  assert.deepEqual(await notes.read('n.md'), before);
  await layered(notes, historyLayer(second, now)).write('n.md', 'two', { author: 'Claude' });

  assert.equal((await notes.read('n.md')).text, 'two');
  assert.deepEqual(
    (await second.changes('n.md')).map((c) => [c.author, c.after]),
    [
      ['Roger', 'one'],
      ['Claude', 'two'],
    ],
  );
  assert.equal((await first.changes()).length, 1, 'the old history is not written to once swapped');
});
