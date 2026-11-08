// The app keeps its notes in Rust, so the layers above ask for them over calls. This is editor spec ES§40 and ES§41,
// crdt_transport and standalone_app. `RemoteCrdt` is the CRDT that asks. Here the JavaScript build stands in for the other
// side, and the Rust build matches it byte for byte (crdt-fixture.test.js). So two devices that talk to it must agree
// as two devices on the JavaScript build do. The calls must also carry what the Rust commands expect.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, RemoteCrdt, VaultKey, SealedStore } from '../src/index.ts';
import { rustLike } from './rust-like.js';

/** How many records the device's store holds: the note's name is hidden there, so all of them are counted. */
const kept = (d) => [...d.store.files.values()].reduce((n, files) => n + [...files.values()].flat().length, 0);

/** A device whose notes are kept by RemoteCrdt over its own sealed store. */
async function device(name, key) {
  const store = new MemoryStore();
  const host = rustLike(name);
  return { name, store, host, crdt: new RemoteCrdt(host.call, new SealedStore(store, key), name) };
}

describe('RemoteCrdt', () => {
  test('a new note keeps its first change in the store, and the text is read at once after', async () => {
    const d = await device('laptop', await VaultKey.create());
    assert.equal(await d.crdt.open('n', 'hello world'), 'hello world');
    assert.equal(d.crdt.text('n'), 'hello world');
    assert.equal(kept(d), 1, 'the first change is kept, sealed');
    const [command, args] = d.host.calls[0];
    assert.equal(command, 'crdt_open');
    assert.deepEqual(args.records, [], 'a note with no record starts new');
    assert.match(args.actor, /^[0-9a-f]{32}$/, 'the actor is 16 bytes, written in hexadecimal');
  });

  test('an edit is kept in the store, and the text follows it', async () => {
    const d = await device('laptop', await VaultKey.create());
    await d.crdt.open('n', 'hello world');
    await d.crdt.splice('n', 6, 11, 'there', 'roger');
    assert.equal(d.crdt.text('n'), 'hello there');
    assert.equal(kept(d), 2);
    const splice = d.host.calls.find(([c]) => c === 'crdt_splice')[1];
    assert.deepEqual(JSON.parse(splice.message), { author: 'roger', device: 'laptop' });
  });

  test('two devices that edited apart agree once their files are copied, and say who made each change', async () => {
    const key = await VaultKey.create();
    const [a, b] = [await device('laptop', key), await device('phone', key)];
    await a.crdt.open('n', 'hello world');
    b.store.copyFrom(a.store);
    await b.crdt.open('n', 'hello world');
    await a.crdt.splice('n', 6, 11, 'there', 'roger');
    await b.crdt.splice('n', 11, 11, '!', 'claude');
    a.store.copyFrom(b.store);
    const joined = await a.crdt.merge('n');
    assert.deepEqual(joined, {
      base: 'hello world',
      ours: 'hello there',
      theirs: 'hello world!',
      merged: 'hello there!',
    });
    assert.equal(a.crdt.text('n'), 'hello there!');
    assert.equal(await a.crdt.merge('n'), undefined, 'nothing new, nothing merged');
    assert.deepEqual((await a.crdt.history('n')).map((m) => m.author).sort(), ['claude', 'roger']);
    assert.equal(await a.crdt.hasBeen('n', 'hello there'), true);
    assert.equal(await a.crdt.hasBeen('n', 'nope'), false);
  });

  test('an anchor stays on its character through the other device’s edit', async () => {
    const key = await VaultKey.create();
    const [a, b] = [await device('laptop', key), await device('phone', key)];
    await a.crdt.open('n', 'hello world');
    b.store.copyFrom(a.store);
    await b.crdt.open('n', 'hello world');
    const pinned = await a.crdt.anchor('n', 6);
    await b.crdt.splice('n', 0, 0, 'Oh, ', 'roger');
    a.store.copyFrom(b.store);
    await a.crdt.merge('n');
    assert.equal(await a.crdt.place('n', pinned), 10);
  });

  test('a note that is not open is refused in words', async () => {
    const d = await device('laptop', await VaultKey.create());
    assert.throws(() => d.crdt.text('none'), /not open/);
  });
});
