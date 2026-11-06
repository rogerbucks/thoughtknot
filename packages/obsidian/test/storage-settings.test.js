// Where graphs are kept: what was saved for it, read back (ES§55, ST1). The settings page itself, with the plug-in
// loaded, is in storage-settings-page.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyFolderOf, keptStorageFrom, HISTORY_FOLDER } from '../src/storage/storage-settings.ts';

test('what was saved is read back: anything not understood is off, and a folder notes cannot be kept in is the default', () => {
  assert.deepEqual(keptStorageFrom(undefined), { history: 'off', historyFolder: '' });
  assert.deepEqual(keptStorageFrom({ history: 'yes', historyFolder: 3 }), { history: 'off', historyFolder: '' });
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '' }), HISTORY_FOLDER);
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '.obsidian' }), HISTORY_FOLDER);
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '../out' }), HISTORY_FOLDER);
  assert.equal(historyFolderOf({ history: 'on', historyFolder: '/Notes/Changes/' }), 'Notes/Changes');
});
