// The live link between two devices (editor spec §45 and §40; board_live_together, mesh_vpn_sync, encrypted_everywhere).
// Presence and records cross channels in memory that keep every byte they carry. Both arrive, nothing on the wire is
// readable, and a device that is not trusted is turned away.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceKeys, MemoryStore, MeshLink, VaultKey, syncedOver } from '../src/index.ts';
import { NOTE, TEXT, at } from './helpers.js';

/** Two ends of a channel in memory. Every message is kept in `wire`. A message waits until its end listens. */
function channelPair(wire) {
  const ends = [0, 1].map(() => ({ kept: [], heard: undefined, closed: undefined, done: false }));
  const make = (i) => ({
    send: (m) => {
      wire.push(m);
      const to = ends[1 - i];
      queueMicrotask(() => (to.heard ? to.heard(m) : to.kept.push(m)));
    },
    listen(heard, closed) {
      ends[i].heard = heard;
      ends[i].closed = closed;
      for (const m of ends[i].kept.splice(0)) heard(m);
      if (ends[i].done) closed();
    },
    close() {
      // closing twice does nothing, as on a real connection
      if (ends[i].done) return;
      for (const e of ends) {
        e.done = true;
        queueMicrotask(() => e.closed?.());
      }
    },
  });
  return [make(0), make(1)];
}

/** A queue of channels a device is waiting to take in. */
function inbox() {
  const waiting = [];
  const pending = [];
  return {
    push: (c) => (pending.length ? pending.shift()(c) : waiting.push(c)),
    next: () => (waiting.length ? Promise.resolve(waiting.shift()) : new Promise((r) => pending.push(r))),
  };
}

/** Two devices, each with a link that dials the other. `trusted` is who each one trusts, by index. */
async function twoDevices(
  trust = [
    [0, 1],
    [0, 1],
  ],
) {
  const key = await VaultKey.create();
  const wire = [];
  const all = [];
  for (const name of ['laptop', 'phone']) {
    const store = new MemoryStore();
    all.push({ name, keys: await DeviceKeys.create(), store, notes: syncedOver(store, key, name), inbox: inbox() });
  }
  all.forEach((d, i) => {
    const other = all[1 - i];
    const trusted = trust[i].map((j) => all[j].keys.publicKey);
    d.link = new MeshLink(d.keys, d.store, trusted, async () => {
      const [mine, theirs] = channelPair(wire);
      other.inbox.push(theirs);
      return mine;
    });
    d.served = d.link.serve(() => d.inbox.next());
  });
  return { all, wire };
}

const has = (chunks, text) => {
  const needle = new TextEncoder().encode(text);
  const all = Uint8Array.from(chunks.flatMap((c) => [...c]));
  return all.some((_, i) => needle.every((b, j) => all[i + j] === b));
};

describe('the live link', () => {
  // proves: board_live_together, encrypted_everywhere
  test('presence reaches the other device and the wire holds nothing readable', async () => {
    const { all, wire } = await twoDevices();
    const heard = new Promise((resolve) => all[1].link.listen(resolve, () => {}));
    all[0].link.send('Ada is looking at the Secret card');
    assert.equal(await heard, 'Ada is looking at the Secret card');
    assert.ok(wire.length >= 2);
    assert.equal(has(wire, 'Secret'), false);
    assert.equal(has(wire, 'Ada'), false);
    for (const d of all) d.served.stop();
  });

  // proves: board_live_together, mesh_vpn_sync
  test('an exchange brings the other device its records and tells it they arrived', async () => {
    const { all, wire } = await twoDevices();
    await all[0].notes.open(NOTE, TEXT);
    const w = at(TEXT, 'Widget');
    await all[0].notes.edit(NOTE, w, w + 'Widget'.length, 'Gadget Secret', 'Ann');
    const arrived = new Promise((resolve) => all[1].link.listen(() => {}, resolve));
    await all[0].link.exchange();
    await arrived;
    await all[1].notes.open(NOTE);
    assert.equal(all[1].notes.read(NOTE).text, all[0].notes.read(NOTE).text);
    assert.equal(has(wire, 'Gadget'), false);
    for (const d of all) d.served.stop();
  });

  // proves: encrypted_everywhere
  test('a device that is not trusted is turned away and hears nothing', async () => {
    // the phone trusts only itself, so it refuses the laptop
    const { all } = await twoDevices([[0, 1], [1]]);
    let heard = false;
    all[1].link.listen(
      () => (heard = true),
      () => {},
    );
    all[0].link.send('hello');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(heard, false);
    for (const d of all) d.served.stop();
  });
});
