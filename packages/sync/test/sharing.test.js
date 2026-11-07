// Starting a shared vault (editor spec §45, board_access). A device makes its keys and trusts others by their public
// key. What it keeps between runs opens on that device alone, and the vault key is never in what is kept.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceKeys, Sharing, fingerprint, fromHex, toHex } from '../src/index.ts';

/** A keeper in memory, as a test needs. `saves` counts what it was handed. */
const memory = () => {
  const keeper = {
    kept: null,
    saves: 0,
    load: async () => keeper.kept,
    save: async (k) => ((keeper.kept = k), keeper.saves++),
  };
  return keeper;
};

describe('board_access: starting a shared vault', () => {
  test('starting makes keys here and keeps them, so the next run opens the same vault', async () => {
    const keeper = memory();
    assert.equal(await Sharing.open(keeper), null, 'nothing kept, nothing to open');
    const mine = await Sharing.start(keeper);
    const again = await Sharing.open(keeper);
    assert.equal(again.publicKey, mine.publicKey);
    assert.match(mine.publicKey, /^04[0-9a-f]{128}$/);
  });

  test('what is kept holds no key in the clear: the vault key is sealed, the private key unexportable', async () => {
    const keeper = memory();
    await Sharing.start(keeper);
    assert.ok(!JSON.stringify(Object.keys(keeper.kept)).includes('key'), JSON.stringify(Object.keys(keeper.kept)));
    await assert.rejects(globalThis.crypto.subtle.exportKey('pkcs8', keeper.kept.pair.privateKey));
    assert.ok(keeper.kept.sealed.length > 32, 'the vault key is sealed for this device');
  });

  test('another device is trusted by its public key, and only a public key is taken', async () => {
    const keeper = memory();
    const mine = await Sharing.start(keeper);
    const theirs = toHex((await DeviceKeys.create()).publicKey);
    assert.equal(await mine.trust(theirs), undefined);
    assert.equal(await mine.trust(`  ${theirs.toUpperCase()}\n`), undefined, 'spaces and capitals do not matter');
    assert.deepEqual(mine.trusted, [theirs]);
    assert.equal(await mine.trust('hello'), 'not-a-key');
    assert.equal(await mine.trust('04ab'), 'not-a-key');
    assert.equal(await mine.trust(mine.publicKey), 'own-key');
    assert.deepEqual((await Sharing.open(keeper)).trusted, [theirs], 'who is trusted is kept');
    await mine.distrust(theirs);
    assert.deepEqual((await Sharing.open(keeper)).trusted, []);
  });

  test('a fingerprint is four groups to read aloud, and the same key gives the same one', async () => {
    const key = fromHex('04' + 'ab'.repeat(64));
    assert.match(await fingerprint(key), /^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
    assert.equal(await fingerprint(key), await fingerprint(key));
    assert.equal(fromHex('xyz'), null);
  });
});
