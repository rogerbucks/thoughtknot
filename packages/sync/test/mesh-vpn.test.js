// Sync over a mesh VPN (editor spec §40, mesh_vpn_sync). Two of the owner's devices sync through a relay, as a mesh
// VPN relays two devices that cannot reach each other directly. The relay is a real TCP server that keeps every byte
// it carries. The devices agree after, the relay saw ciphertext only, and no private key ever left a device.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeviceKeys, FolderStore, MESH_VPNS, MemoryStore, Peer, VaultKey, framed, syncedOver } from '../src/index.ts';
import { NOTE, TEXT, at, nodeFiles } from './helpers.js';

/** A relay on this machine: it joins the first two devices that reach it, and keeps every byte it carries. */
async function relay() {
  const carried = [];
  const waiting = [];
  const server = createServer((socket) => {
    waiting.push(socket);
    if (waiting.length < 2) return;
    const [a, b] = waiting.splice(0, 2);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      from.on('data', (bytes) => {
        carried.push(new Uint8Array(bytes));
        to.write(bytes);
      });
      from.on('close', () => to.end());
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { carried, port: server.address().port, close: () => server.close() };
}

/** A channel to the relay: each message after its length, as a host carries it over the VPN. */
async function channelTo(port) {
  const socket = createConnection({ port, host: '127.0.0.1' });
  await new Promise((done) => socket.once('connect', done));
  let buffered = new Uint8Array();
  return {
    send: (message) => socket.write(framed([message])),
    listen(heard, closed) {
      socket.on('data', (bytes) => {
        buffered = new Uint8Array([...buffered, ...bytes]);
        while (buffered.length >= 4) {
          const n = new DataView(buffered.buffer).getUint32(0);
          if (buffered.length < 4 + n) break;
          heard(buffered.slice(4, 4 + n));
          buffered = buffered.slice(4 + n);
        }
      });
      socket.on('close', closed);
    },
    close: () => socket.end(),
  };
}

/** A device: its own key pair, its store, and its notes over that store, all sharing the owner's vault key. */
async function device(name, key) {
  const store = new MemoryStore();
  return { name, keys: await DeviceKeys.create(), store, notes: syncedOver(store, key, name) };
}

const has = (chunks, text) => {
  const needle = new TextEncoder().encode(text);
  const all = Uint8Array.from(chunks.flatMap((c) => [...c]));
  return all.some((_, i) => needle.every((b, j) => all[i + j] === b));
};

describe('sync over a mesh VPN', () => {
  // proves: mesh_vpn_sync
  test('two devices sync through a relay, which carries ciphertext only, and both draw the same note', async () => {
    assert.deepEqual(MESH_VPNS, ['Tailscale', 'Headscale', 'NetBird', 'Nebula', 'WireGuard']);
    const key = await VaultKey.create();
    const [laptop, phone] = [await device('laptop', key), await device('phone', key)];
    await laptop.notes.open(NOTE, TEXT);
    const w = at(TEXT, 'Widget');
    assert.equal(await laptop.notes.edit(NOTE, w, w + 'Widget'.length, 'Gadget Secret', 'Ann'), undefined);
    const r = await relay();
    try {
      const trusted = [laptop.keys.publicKey, phone.keys.publicKey];
      const [a, b] = await Promise.all([
        new Peer(laptop.keys, laptop.store, trusted).sync(await channelTo(r.port)),
        new Peer(phone.keys, phone.store, trusted).sync(await channelTo(r.port)),
      ]);
      assert.equal(a.got, 0);
      assert.ok(b.got > 0, JSON.stringify(b));
      const there = await phone.notes.open(NOTE);
      assert.equal(there.text, laptop.notes.read(NOTE).text, 'the phone draws the same note');
      at(there.text, 'Gadget Secret');
      // what the relay carried: no text, no name of a note or a device, only ciphertext
      assert.ok(r.carried.length > 0);
      for (const plain of ['Gadget Secret', 'Widget', 'Shop', NOTE, 'laptop', 'phone', 'Ann', 'held', 'records'])
        assert.equal(has(r.carried, plain), false, `the relay saw "${plain}"`);
    } finally {
      r.close();
    }
  });

  // proves: mesh_vpn_sync
  test('a device that is not the owner’s is sent nothing, and no private key can leave a device', async () => {
    const key = await VaultKey.create();
    const [laptop, stranger] = [await device('laptop', key), await device('stranger', await VaultKey.create())];
    await laptop.notes.open(NOTE, TEXT);
    const r = await relay();
    try {
      const [a, b] = await Promise.all([
        new Peer(laptop.keys, laptop.store, [laptop.keys.publicKey]).sync(await channelTo(r.port)),
        new Peer(stranger.keys, stranger.store, [laptop.keys.publicKey]).sync(await channelTo(r.port)),
      ]);
      assert.ok('refused' in a, JSON.stringify(a));
      assert.ok('refused' in b, JSON.stringify(b));
      assert.equal((await stranger.store.held()).size, 0, 'the stranger got nothing');
      // only the two public keys crossed: 65 bytes each, after their length
      assert.equal(
        r.carried.reduce((n, c) => n + c.length, 0),
        2 * (4 + 65),
      );
    } finally {
      r.close();
    }
    // a private key is made so it cannot be exported, and a key says only that it is one
    assert.equal(String(laptop.keys), '[ThoughtKnot key: never shown]');
    assert.equal(JSON.stringify({ k: laptop.keys }), '{"k":"[ThoughtKnot key: never shown]"}');
  });

  // proves: mesh_vpn_sync
  test('a folder store says what it holds and takes in what another device sent, file by file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tk-shelf-'));
    try {
      const shelf = new FolderStore(nodeFiles(root));
      const [one, two] = [new Uint8Array([1, 2]), new Uint8Array([3])];
      await shelf.add('Notes/Shop.md', 'my laptop', one);
      await shelf.copyIn('Notes/Shop.md', 'phone', [two, one]);
      assert.deepEqual(
        [...(await shelf.held())].map(([note, d]) => [note, [...d].sort()]),
        [
          [
            'Notes/Shop.md',
            [
              ['my laptop', 1],
              ['phone', 2],
            ],
          ],
        ],
      );
      assert.deepEqual(await shelf.recordsOf('Notes/Shop.md', 'phone', 1), [one]);
      assert.deepEqual(await shelf.recordsOf('Notes/Shop.md', 'tablet', 0), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
