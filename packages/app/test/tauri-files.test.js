// The desktop app's notes pass the one storage contract (spec §41, standalone_app; storage_contract). The app reaches
// the disk only through its commands (src-tauri/src/place.rs). Here a stand-in answers them over a real folder.
// It answers as the Rust does: entries as [name, is a folder], and the text `ENOENT` when there is no file
// (app-window.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { storageContract } from '../../core/src/storage-contract.ts';
import { tauriFiles, tauriReadPicture, tauriStorage } from '../src/tauri-files.ts';
import { cleanUpApp, emptyFolder, fakeInvoke } from './app-window.js';

test.after(cleanUpApp);

describe("notes kept in the desktop app's folder pass the storage contract", () => {
  for (const check of storageContract(() => tauriStorage(fakeInvoke(emptyFolder())), {
    windows: process.platform === 'win32',
  }))
    test(check.name, check.run);
});

test('the app\'s "no file" is read as no note, and any other failure is said as it came', async () => {
  const files = tauriFiles(async (command) => Promise.reject(command === 'read_text' ? 'ENOENT' : 'disk full'));
  await assert.rejects(files.readText('a.md'), (e) => e.code === 'ENOENT');
  await assert.rejects(files.writeText('a.md', 'x'), (e) => e.message === 'disk full' && e.code === undefined);
  assert.equal(await tauriStorage(async (c) => Promise.reject(c === 'read_text' ? 'ENOENT' : 'x')).read('a.md'), null);
});

test('hidden folders such as .git are left out of the list of notes', async () => {
  const root = emptyFolder();
  await fs.mkdir(join(root, '.git'));
  await fs.writeFile(join(root, '.git', 'x.md'), 'no');
  await fs.writeFile(join(root, 'a.md'), 'yes');
  assert.deepEqual(await tauriStorage(fakeInvoke(root)).list(), ['a.md']);
});

test('a kept picture is read back as the bytes the command gave, and its refusal is said as it came', async () => {
  const root = emptyFolder();
  await fs.mkdir(join(root, 'attachments'));
  await fs.writeFile(join(root, 'attachments', 'a.png'), Uint8Array.of(0x89, 0x50, 0x4e, 0x47));
  const read = tauriReadPicture(fakeInvoke(root));
  assert.deepEqual([...(await read('attachments/a.png'))], [0x89, 0x50, 0x4e, 0x47]);
  const refused = tauriReadPicture(async () => Promise.reject('not a picture to read'));
  await assert.rejects(refused('a.md'), /not a picture to read/);
});
