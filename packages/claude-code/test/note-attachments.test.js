// Pictures kept beside an open note and sent back (editor spec ES§45, board_images_kept; spec §26).
// Each case is tried on the real store and a running server. The escapes are laid out in a real vault on disk.
// - Only a PNG, JPEG, GIF or WebP by its first bytes, never SVG, at most 8 MB.
// - Only into the folder beside the note, never through a link and never outside the vault.
// - Never over a file: a name taken gives the next.
// - Sent back only for a name the server could have given, with its own type and nothing the browser may run.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PICTURE_MOST_BYTES } from '@thoughtknot/core';
import { ask } from './editor-threats-support.js';
import { bearer, served, tempVault, writing } from './editor-store-support.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

/** The plan note opened on a served store, and what is needed to keep and fetch pictures beside it. */
async function opened(v = tempVault()) {
  const { store, server } = await served(v);
  const o = await store.open('Notes/plan.md');
  assert.equal(o.ok, true, o.why);
  const keep = (name, bytes, headers = { ...writing(server), 'content-type': 'application/json' }) =>
    ask(server.port, {
      method: 'PUT',
      path: `/api/notes/${o.id}/attachment`,
      headers,
      body: JSON.stringify({ name, base64: Buffer.from(bytes).toString('base64') }),
    });
  const fetchPicture = (name, headers = bearer(server)) =>
    fetch(`http://127.0.0.1:${server.port}/api/notes/${o.id}/attachment/${name}`, { headers });
  return { v, server, id: o.id, keep, fetchPicture, folder: join(v.vault, 'Notes', 'attachments') };
}

describe('board_images_kept: a picture is kept beside the note', () => {
  // proves: board_images_kept
  test('a PNG is kept in the folder beside the note, as the same bytes, and its link is given from the vault top', async () => {
    const { keep, folder } = await opened();
    const r = await keep('My photo.png', PNG);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(JSON.parse(r.text), { src: 'Notes/attachments/My-photo.png' });
    assert.deepEqual(readFileSync(join(folder, 'My-photo.png')), PNG);
  });

  // proves: board_images_kept
  test('a name taken gives the next number, and the picture already there is never changed', async () => {
    const { keep, folder } = await opened();
    await keep('pic.png', PNG);
    const again = await keep('pic.png', Buffer.concat([PNG, Buffer.from([7])]));
    assert.equal(JSON.parse(again.text).src, 'Notes/attachments/pic-2.png');
    assert.deepEqual(readFileSync(join(folder, 'pic.png')), PNG);
    assert.equal((await keep('pic.png', PNG)).status, 200);
    assert.deepEqual(readdirSync(folder).sort(), ['pic-2.png', 'pic-3.png', 'pic.png']);
  });

  // proves: board_images_kept
  test('the kind is read from the first bytes, not the name: a JPEG named .svg is kept as a .jpg', async () => {
    const { keep } = await opened();
    assert.equal(JSON.parse((await keep('drawing.svg', JPEG)).text).src, 'Notes/attachments/drawing.jpg');
  });

  // proves: board_images_kept
  test('an SVG, a page and bytes that are no picture are refused whatever they are named, and nothing is written', async () => {
    const { keep, folder } = await opened();
    for (const [name, bytes] of [
      ['logo.svg', SVG],
      ['logo.png', SVG],
      ['page.png', Buffer.from('<!doctype html><script>alert(1)</script>')],
      ['plain.gif', Buffer.from('not a picture')],
    ]) {
      const r = await keep(name, bytes);
      assert.equal(r.status, 415, `${name}: ${r.text}`);
    }
    assert.equal(existsSync(folder) ? readdirSync(folder).length : 0, 0);
  });

  // proves: board_images_kept
  test('a request that is not a picture sent whole is refused: not JSON, no bytes, base64 that is not plain', async () => {
    const { server, id } = await opened();
    const headers = { ...writing(server), 'content-type': 'application/json' };
    const send = (body) => ask(server.port, { method: 'PUT', path: `/api/notes/${id}/attachment`, headers, body });
    assert.equal((await send('not json')).status, 400);
    assert.equal((await send(JSON.stringify({ name: 'a.png' }))).status, 400);
    assert.equal((await send(JSON.stringify({ name: 'a.png', base64: '' }))).status, 400);
    assert.equal((await send(JSON.stringify({ name: 'a.png', base64: 'iVBO Rw0K!' }))).status, 400);
    assert.equal((await send(JSON.stringify({ name: 5, base64: 'AAAA' }))).status, 400);
  });

  // proves: board_images_kept
  test('one larger than eight million bytes is refused, and nothing is written', async () => {
    const { keep, folder } = await opened();
    const big = Buffer.concat([PNG, Buffer.alloc(PICTURE_MOST_BYTES)]);
    const r = await keep('big.png', big);
    assert.equal(r.status, 413, r.text);
    assert.equal(existsSync(folder), false);
    assert.equal(
      (await keep('edge.png', Buffer.concat([PNG, Buffer.alloc(PICTURE_MOST_BYTES - PNG.length)]))).status,
      200,
    );
  });

  // proves: board_images_kept
  test('it takes the page’s token and its own origin, as any change does', async () => {
    const { server, keep, folder } = await opened();
    assert.equal((await keep('a.png', PNG, { 'content-type': 'application/json' })).status, 401);
    const noOrigin = { ...bearer(server), 'content-type': 'application/json' };
    assert.equal((await keep('a.png', PNG, noOrigin)).status, 403);
    const other = { ...writing(server), origin: 'http://evil.example', 'content-type': 'application/json' };
    assert.equal((await keep('a.png', PNG, other)).status, 403);
    assert.equal(existsSync(folder), false);
  });
});

describe('board_images_kept: a picture never leaves the vault, and never goes through a link', () => {
  // proves: board_images_kept
  test('a folder beside the note that is a link out of the vault is refused, and nothing is written outside', async () => {
    const v = tempVault();
    symlinkSync(v.outside, join(v.vault, 'Notes', 'attachments'));
    const { keep } = await opened(v);
    const r = await keep('escape.png', PNG);
    assert.equal(r.status, 403, r.text);
    assert.deepEqual(readdirSync(v.outside), ['secret.md']);
  });

  // proves: board_images_kept
  test('a file in the folder that is a link is never written through: the picture takes the next name', async () => {
    const v = tempVault();
    mkdirSync(join(v.vault, 'Notes', 'attachments'));
    symlinkSync(join(v.outside, 'secret.md'), join(v.vault, 'Notes', 'attachments', 'pic.png'));
    const { keep, folder } = await opened(v);
    const r = await keep('pic.png', PNG);
    assert.equal(JSON.parse(r.text).src, 'Notes/attachments/pic-2.png');
    assert.equal(readFileSync(join(v.outside, 'secret.md'), 'utf8'), 'Outside the vault.\n');
    assert.deepEqual(readFileSync(join(folder, 'pic-2.png')), PNG);
  });

  // proves: board_images_kept
  test('a note whose folder is reached by a link out of the vault is never opened, so no picture is kept there', async () => {
    const v = tempVault();
    const { store } = await served(v);
    const o = await store.open('Linked/anything.md');
    assert.equal(o.ok, false);
    assert.deepEqual(readdirSync(v.outside), ['secret.md']);
  });
});

describe('board_images_kept: a picture is sent back with its own type', () => {
  // proves: board_images_kept
  test('the bytes come back as they were kept, as their own type, with no sniffing and nothing it may run', async () => {
    const { keep, fetchPicture } = await opened();
    await keep('pic.png', PNG);
    await keep('photo.jpg', JPEG);
    const png = await fetchPicture('pic.png');
    assert.equal(png.status, 200);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal(png.headers.get('x-content-type-options'), 'nosniff');
    assert.match(png.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
    assert.deepEqual(Buffer.from(await png.arrayBuffer()), PNG);
    assert.equal((await fetchPicture('photo.jpg')).headers.get('content-type'), 'image/jpeg');
  });

  // proves: board_images_kept
  test('it asks for the token, and sends no picture to the proposer’s key', async () => {
    const { keep, fetchPicture } = await opened();
    await keep('pic.png', PNG);
    assert.equal((await fetchPicture('pic.png', {})).status, 401);
    assert.equal((await fetchPicture('pic.png', { authorization: 'Bearer not-the-token' })).status, 401);
  });

  // proves: board_images_kept
  test('a name the server could not have given is not found: a path, a hidden file, an SVG, a link, a file that is no picture', async () => {
    const v = tempVault();
    mkdirSync(join(v.vault, 'Notes', 'attachments'));
    writeFileSync(join(v.vault, 'Notes', 'attachments', 'logo.png'), SVG);
    writeFileSync(join(v.vault, 'Notes', 'attachments', 'logo.svg'), SVG);
    writeFileSync(join(v.outside, 'out.png'), PNG);
    symlinkSync(join(v.outside, 'out.png'), join(v.vault, 'Notes', 'attachments', 'linked.png'));
    writeFileSync(join(v.vault, 'Notes', 'plan2.png'), PNG);
    const { fetchPicture } = await opened(v);
    for (const name of [
      'logo.png',
      'logo.svg',
      'linked.png',
      'missing.png',
      '..%2Fplan2.png',
      '.hidden.png',
      'a%20b.png',
    ])
      assert.equal((await fetchPicture(name)).status, 404, name);
  });
});
