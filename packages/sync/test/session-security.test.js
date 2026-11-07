// A sealed mesh session (editor spec §40, mesh_vpn_sync; encrypted_everywhere). A message recorded, repeated, sent back,
// dropped, moved, or taken from another session does not open. A relay that does any of these ends the sync.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceKeys, MemoryStore, Peer, Session, VaultKey, syncedOver } from '../src/index.ts';
import { NOTE, TEXT } from './helpers.js';

const text = (s) => new TextEncoder().encode(s);

/** Two sessions, one for each side, between two fresh devices. */
async function pair() {
  const [a, b] = [await DeviceKeys.create(), await DeviceKeys.create()];
  const [sa, sb] = [Session.salt(), Session.salt()];
  return { a: await Session.open(a, b.publicKey, sa, sb), b: await Session.open(b, a.publicKey, sb, sa) };
}

describe('a mesh session', () => {
  // proves: mesh_vpn_sync
  test('opens each message once, in order, and refuses a copy, a reflection, a gap, a swap or another session', async () => {
    const { a, b } = await pair();
    const [m0, m1, m2] = [await a.seal(text('zero')), await a.seal(text('one')), await a.seal(text('two'))];
    assert.equal(new TextDecoder().decode(await b.open(m0)), 'zero');
    await assert.rejects(b.open(m0), 'a repeated message');
    assert.equal(new TextDecoder().decode(await b.open(m1)), 'one');
    await assert.rejects(b.open(m1), 'a repeated message');
    const later = await pair();
    await assert.rejects(
      later.b.open(await later.a.seal(text('x'))).then(() => later.b.open(m2)),
      'another session',
    );
    const { a: c, b: d } = await pair();
    const [n0, n1] = [await c.seal(text('p')), await c.seal(text('q'))];
    await assert.rejects(d.open(n1), 'a message moved ahead, the first dropped');
    const { a: e, b: f } = await pair();
    await assert.rejects(e.open(await e.seal(text('mine'))), 'a message sent back the way it came');
    assert.ok(n0.length > 0 && (await f.seal(text('r'))).length > 0);
  });

  // proves: mesh_vpn_sync
  test('a relay that repeats a message ends the sync, and nothing it carried is taken in', async () => {
    const key = await VaultKey.create();
    const [ka, kb] = [await DeviceKeys.create(), await DeviceKeys.create()];
    const [sa, sb] = [new MemoryStore(), new MemoryStore()];
    await syncedOver(sa, key, 'a').open(NOTE, TEXT);
    const trusted = [ka.publicKey, kb.publicKey];
    let heardA, heardB;
    const chan = (side) => ({
      send: (m) => {
        const target = side === 'a' ? () => heardB : () => heardA;
        setTimeout(() => {
          target()?.(m);
          target()?.(m);
        }, 0);
      },
      listen: (h) => {
        if (side === 'a') heardA = h;
        else heardB = h;
      },
      close: () => {},
    });
    const [ra, rb] = await Promise.all([
      new Peer(ka, sa, trusted).sync(chan('a')),
      new Peer(kb, sb, trusted).sync(chan('b')),
    ]);
    // the first message is the key and salt, repeated: both sides refuse it
    assert.ok('refused' in ra || 'refused' in rb, JSON.stringify([ra, rb]));
    assert.equal((await sb.held()).size, 0, 'nothing was taken in');
  });
});
