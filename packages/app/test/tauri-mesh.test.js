// The app's mesh channel (editor spec §40, mesh_vpn_sync, encrypted_everywhere). Two apps sync over the mesh commands,
// here answered by two in-memory relays. Only sealed bytes reach the commands. The Rust refuses an address that is not
// a private one, so no channel opens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceKeys, MemoryStore, Peer, VaultKey, syncedOver } from '@thoughtknot/sync';
import { dialDevice, listenForDevice } from '../src/tauri-mesh.ts';
import { NOTE, TEXT } from '../../sync/test/helpers.js';

/** The mesh commands of two apps joined by a wire in memory; `wire` keeps every message sent. */
function wires() {
  const wire = [];
  const inbox = { a: [], b: [] };
  const waiting = { a: [], b: [] };
  const side = (me, other) => async (command, args) => {
    if (command === 'mesh_listen') return [1, args.address];
    if (command === 'mesh_accept') return 11;
    if (command === 'mesh_dial') {
      if (!args.address.startsWith('100.')) throw new Error('Only addresses on the home network or the mesh VPN');
      return 12;
    }
    if (command === 'mesh_send') {
      wire.push(Uint8Array.from(args.message));
      inbox[other].push(args.message);
      waiting[other].splice(0).forEach((wake) => wake());
      return null;
    }
    if (command === 'mesh_receive') {
      // waits for a message to arrive, as the Rust waits on the socket
      if (!inbox[me].length) await new Promise((wake) => waiting[me].push(wake));
      return inbox[me].shift() ?? null;
    }
    return null;
  };
  return { wire, a: side('a', 'b'), b: side('b', 'a') };
}

test('two apps sync over the mesh commands, and the wire holds sealed bytes only', async () => {
  const key = await VaultKey.create();
  const [ka, kb] = [await DeviceKeys.create(), await DeviceKeys.create()];
  const [sa, sb] = [new MemoryStore(), new MemoryStore()];
  const notes = syncedOver(sa, key, 'a');
  await notes.open(NOTE, TEXT);
  const w = wires();
  const listener = await listenForDevice(w.a, '100.64.0.1:7000');
  assert.equal(listener.address, '100.64.0.1:7000');
  const trusted = [ka.publicKey, kb.publicKey];
  const [ra, rb] = await Promise.all([
    listener.next().then((c) => new Peer(ka, sa, trusted).sync(c)),
    dialDevice(w.b, '100.64.0.1:7000').then((c) => new Peer(kb, sb, trusted).sync(c)),
  ]);
  assert.equal(ra.got, 0);
  assert.ok(rb.got > 0, JSON.stringify(rb));
  const all = new TextDecoder('latin1').decode(Uint8Array.from(w.wire.flatMap((m) => [...m])));
  for (const plain of ['Widget', 'Shop', 'price', 'records', 'held']) assert.equal(all.includes(plain), false, plain);
  await assert.rejects(dialDevice(w.b, '8.8.8.8:80'), /home network or the mesh VPN/);
});
