// The earlier versions of the notes the plug-in changed, kept in its own data (editor spec §41, changes_view_obsidian;
// risk NEURO-2). Loaded from source: the store each app's history is kept in, the keeper that vault-storage.ts calls
// with a note's text just before a change, and the rename that carries a note's versions with it. The window that
// draws a version is tested through the plug-in in compare-with.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followHistory, keepHistory, keeperOf, versionsOf } from '../src/storage/note-history.ts';

/** A plug-in of an app whose vault tells it of renames, and a store of its data, held in memory. */
function plugin() {
  const renames = [];
  const app = { vault: { on: (name, f) => (name === 'rename' && renames.push(f), { name }) } };
  let data = {};
  return {
    plugin: { app, registerEvent: () => {} },
    store: { get: () => data, set: (d) => (data = d) },
    rename: (from, to) => renames.forEach((f) => f({ path: to }, from)),
    data: () => data,
  };
}

// proves: changes_view_obsidian
test('the text a note had before each change is kept, newest first, and follows the note renamed', () => {
  const p = plugin();
  keepHistory(p.plugin, p.store);
  const keep = keeperOf(p.plugin.app);
  assert.ok(keep, 'a keeper once the plug-in keeps history');
  keep('A.md', 'first');
  assert.deepEqual(
    versionsOf(p.plugin.app, 'A.md').map((v) => v.text),
    ['first'],
  );
  assert.ok(p.data().history, 'kept in the plug-in data');
  p.rename('A.md', 'B.md');
  assert.deepEqual(versionsOf(p.plugin.app, 'A.md'), []);
  assert.deepEqual(
    versionsOf(p.plugin.app, 'B.md').map((v) => v.text),
    ['first'],
  );
  const before = p.data();
  followHistory(p.plugin.app, 'None.md', 'Other.md');
  assert.equal(p.data(), before, 'a note with nothing kept changes nothing');
});

// proves: changes_view_obsidian
test('an app whose plug-in keeps no history has no keeper and no versions', () => {
  const p = plugin();
  keepHistory(undefined, p.store);
  assert.equal(keeperOf(p.plugin.app), undefined);
  assert.deepEqual(versionsOf(p.plugin.app, 'A.md'), []);
  followHistory(p.plugin.app, 'A.md', 'B.md');
  assert.deepEqual(p.data(), {});
});
