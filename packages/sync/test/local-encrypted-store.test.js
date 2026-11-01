// Every device holds its own encrypted copy and syncs with no server (editor spec §40, local_encrypted_store). Here two
// devices with folders of their own, as Syncthing shares them, edit while apart. Once their folders are copied they
// agree, and what each keeps on disk is sealed by the wrapper over upstream Automerge.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FolderStore, RECORDS_FILE, VaultKey, framed, syncedInFolder, unframed } from '../src/index.ts';
import { NOTE, TEXT, at, nodeFiles } from './helpers.js';

/** Every file under `dir`, with its bytes. */
async function filesIn(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true }))
    if (e.isFile()) out.push({ path: join(e.parentPath, e.name), bytes: await readFile(join(e.parentPath, e.name)) });
  return out;
}

describe('local_encrypted_store', () => {
  // proves: local_encrypted_store
  test('two devices offline then reconnected converge, and data at rest is sealed by the wrapper', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'tk-sync-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const [deskDir, phoneDir] = [join(root, 'desktop'), join(root, 'phone')];
    const key = await VaultKey.create();
    const desk = syncedInFolder(nodeFiles(deskDir), key, 'desktop');
    await desk.open(NOTE, TEXT);
    await cp(deskDir, phoneDir, { recursive: true });
    const phone = syncedInFolder(nodeFiles(phoneDir), key, 'phone');
    await phone.open(NOTE, TEXT);

    // apart: each edits its own copy
    await desk.edit(NOTE, 0, 0, 'Written on the desktop.\n', 'Roger');
    const end = at(TEXT, '\n```\n');
    await phone.edit(NOTE, end, end, "\n(g:Product {name: 'Gadget', price: 3})", 'Roger');
    assert.notEqual(desk.read(NOTE).text, phone.read(NOTE).text);

    // back together: Syncthing copies each device's files to the other
    await cp(deskDir, phoneDir, { recursive: true });
    await cp(phoneDir, deskDir, { recursive: true });
    await desk.sync(NOTE);
    await phone.sync(NOTE);
    assert.equal(desk.read(NOTE).text, phone.read(NOTE).text);
    assert.ok(desk.read(NOTE).text.includes('Written on the desktop.') && desk.read(NOTE).text.includes('Gadget'));

    // at rest: no note name, no device name and no word of the note on disk
    const files = await filesIn(deskDir);
    assert.ok(files.length >= 2 && files.every((f) => f.path.endsWith(RECORDS_FILE)));
    for (const f of files) {
      const said = `${f.path.slice(deskDir.length)}\n${f.bytes.toString('latin1')}`;
      for (const word of ['Shop', 'Widget', 'Gadget', 'desktop', 'phone', 'Roger', 'Written'])
        assert.ok(!said.includes(word), `${word} is not kept in the clear`);
    }

    // another vault's key opens none of it
    const stranger = syncedInFolder(nodeFiles(deskDir), await VaultKey.create(), 'stranger');
    await stranger.open(NOTE);
    assert.equal(stranger.read(NOTE).text, '', 'a stranger’s key finds no note there');
    const sealed = unframed(new Uint8Array(files[0].bytes));
    const other = await VaultKey.create();
    await assert.rejects(other.open(sealed[0]));
  });

  // proves: local_encrypted_store
  test('a record still being copied in is read up to its last whole record, and the store needs no server', async () => {
    const whole = framed([new Uint8Array([1, 2]), new Uint8Array([3])]);
    assert.deepEqual(unframed(whole.slice(0, whole.length - 1)), [new Uint8Array([1, 2])]);
    assert.deepEqual(unframed(whole), [new Uint8Array([1, 2]), new Uint8Array([3])]);
    const store = new FolderStore(nodeFiles(join(tmpdir(), 'tk-sync-never-made')));
    assert.deepEqual(await store.records('nothing'), []);
  });
});
