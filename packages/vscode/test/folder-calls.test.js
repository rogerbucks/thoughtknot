// The page's calls into the note's folder in VS Code (spec ES§41, vscode_plugin).
// The picture the page asks for back is among them (editor spec ES§45, board_images_kept).
// Each call is checked before the disk is asked. The disk here is in memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICTURE_MOST_BYTES } from '@thoughtknot/core';
import { folderCalls } from '../src/folder-calls.ts';
import { SYMBOLIC_LINK } from '../src/place.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 8, 9]);

/** A disk of files in memory: `types` gives a path's file type bits, and a read of what is not there is `ENOENT`. */
function disk(files = {}, types = {}) {
  const asked = [];
  return {
    asked,
    readText: async () => '',
    writeText: async () => {},
    created: [],
    sizes: {},
    taken: new Set(),
    createBytes: async function (path, bytes) {
      // a file made by another program just before this one: it is there from now on
      if (this.taken.delete(path)) files[path] = PNG;
      if (path in files) throw Object.assign(new Error('there'), { code: 'EEXIST' });
      this.created.push(path);
      files[path] = bytes;
    },
    sizeOf: async function (path) {
      return this.sizes[path] ?? files[path]?.length ?? 0;
    },
    delete: async function (path) {
      delete files[path];
    },
    readDirectory: async () => [],
    createDirectory: async () => {},
    typeOf: async (path) => types[path] ?? (path in files ? 1 : null),
    readBytes: async (path) => {
      asked.push(path);
      if (!(path in files)) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return files[path];
    },
  };
}
const ask = (d, path) => folderCalls(d)({ kind: 'call', id: 1, call: 'read_bytes', args: { path } });

// proves: board_images_kept
test('a picture is read back as base64, which a message carries as text', async () => {
  const reply = await ask(disk({ 'Plans/attachments/pic.png': PNG }), 'Plans/attachments/pic.png');
  assert.equal(reply.ok, true);
  assert.deepEqual(new Uint8Array(Buffer.from(reply.value, 'base64')), PNG);
});

// proves: board_images_kept
test('a path that climbs out, is hidden, or goes through a link is refused before the disk is asked', async () => {
  const d = disk({ 'a/b.png': PNG, 'out/c.png': PNG }, { a: 2, 'a/b.png': 1, out: 2 | SYMBOLIC_LINK, 'out/c.png': 1 });
  for (const path of ['../b.png', '.git/b.png', '/etc/passwd', 'out/c.png'])
    assert.equal((await ask(d, path)).ok, false, path);
  assert.deepEqual(d.asked, []);
});

// proves: board_images_kept
test('a file larger than a picture may be is not read as one, and a file not there is ENOENT', async () => {
  const big = new Uint8Array(PICTURE_MOST_BYTES + 1);
  const d = disk({ 'big.png': big });
  const refused = await ask(d, 'big.png');
  assert.equal(refused.ok, false);
  assert.match(refused.error, /larger than a picture/);
  assert.deepEqual(await ask(d, 'none.png'), { kind: 'reply', id: 1, ok: false, error: 'ENOENT' });
});

// proves: board_images_kept
test('a picture larger than a picture may be is refused by its size, before any of it is read', async () => {
  const d = disk({ 'huge.png': PNG });
  d.sizes['huge.png'] = PICTURE_MOST_BYTES + 1;
  const refused = await ask(d, 'huge.png');
  assert.equal(refused.ok, false);
  assert.deepEqual(d.asked, []);
});

// proves: board_images_kept
test('a file is created, not written: a name taken in between takes the next, and those made are taken away', async () => {
  const d = disk();
  const files = [
    ['a.png', [...PNG]],
    ['b.png', [...PNG]],
  ];
  d.taken.add('Plans/b.png');
  const reply = await folderCalls(d)({ kind: 'call', id: 1, call: 'write_new', args: { into: 'Plans', files } });
  assert.equal(reply.ok, true, reply.error);
  assert.deepEqual(reply.value, ['a.png', 'b-2.png']);
  // a.png was made, taken away when b.png was found taken, and made again with b-2.png
  assert.deepEqual(d.created, ['Plans/a.png', 'Plans/a.png', 'Plans/b-2.png']);
});

// proves: board_images_kept
test('a file that is a link, even one with nothing behind it, is never taken as a free name', async () => {
  const d = disk({}, { 'Plans/a.png': 64 });
  const files = [['a.png', [...PNG]]];
  const reply = await folderCalls(d)({ kind: 'call', id: 1, call: 'write_new', args: { into: 'Plans', files } });
  assert.deepEqual(reply.value, ['a-2.png']);
});
