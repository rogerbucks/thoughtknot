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

describe('board_access: invitations between two devices', () => {
  /** An owner with a vault who trusts a second device that has made its keys and nothing more. */
  async function pair() {
    const owner = await Sharing.start(memory());
    const guestKeeper = memory();
    const guest = await Sharing.prepare(guestKeeper);
    await owner.trust(guest.publicKey);
    return { owner, guest, guestKeeper };
  }

  test('an owner invites a trusted device, who joins and then holds the same vault key', async () => {
    const { owner, guest, guestKeeper } = await pair();
    assert.equal(guest.hasVault, false, 'a device prepared to be invited has no vault yet');
    const text = await owner.invite('ideas', 'edit', guest.publicKey);
    const read = Sharing.read(text);
    assert.deepEqual([read.board, read.as, read.fromKey], ['ideas', 'edit', owner.publicKey]);
    assert.equal(await guest.accept(text), undefined);
    assert.equal(guest.hasVault, true);
    assert.deepEqual(guest.joined, { board: 'ideas', as: 'edit', from: owner.publicKey });
    assert.deepEqual(guest.trusted, [owner.publicKey], 'the inviter is now trusted');
    const sealedBy = (s) => s.held.vault.seal(new TextEncoder().encode('same'));
    const opened = await owner.held.vault.open(await sealedBy(guest));
    assert.equal(new TextDecoder().decode(opened), 'same', 'what one seals the other opens');
    const later = await Sharing.open(guestKeeper);
    assert.equal(later.hasVault, true, 'the joined vault is kept');
    assert.equal(later.joined.as, 'edit');
  });

  test('only a trusted device can be invited, and only a vault can invite', async () => {
    const { owner, guest } = await pair();
    const stranger = toHex((await DeviceKeys.create()).publicKey);
    assert.equal(await owner.invite('ideas', 'view', stranger), undefined);
    assert.equal(await guest.invite('ideas', 'view', owner.publicKey), undefined, 'no vault, no invitation');
  });

  test('an invitation opens on the device it was sealed for and no other, and a device with a vault takes none', async () => {
    const { owner, guest } = await pair();
    const text = await owner.invite('ideas', 'view', guest.publicKey);
    const other = await Sharing.prepare(memory());
    assert.equal(await other.accept(text), 'not-for-this-device');
    assert.equal(other.hasVault, false);
    assert.equal(await other.accept('hello'), 'not-an-invitation');
    assert.equal(await other.accept(text.slice(0, -8)), 'not-an-invitation');
    assert.equal(await owner.accept(text), 'has-vault');
    assert.equal(await guest.accept(text), undefined);
  });

  test('an invitation is text that carries no key in the clear, and a board name in any script survives', async () => {
    const { owner, guest } = await pair();
    const text = await owner.invite('Идеи ✨', 'comment', guest.publicKey);
    assert.match(text, /^thoughtknot-invitation:[A-Za-z0-9+/=]+$/);
    assert.equal(Sharing.read(text).board, 'Идеи ✨');
    const shown = JSON.stringify(Sharing.read(text), (_, v) => (v instanceof Uint8Array ? `${v.length} bytes` : v));
    assert.ok(!shown.includes('[ThoughtKnot key'), shown);
  });
});

describe('mesh_vpn_sync: where the link runs', () => {
  test('the addresses are kept and come back in the next run, and an empty text clears one', async () => {
    const keeper = memory();
    const mine = await Sharing.start(keeper);
    assert.deepEqual(mine.link, {});
    await mine.setLink({ listen: ' 100.64.0.1:4040 ', dial: '100.64.0.2:4040' });
    assert.deepEqual((await Sharing.open(keeper)).link, { listen: '100.64.0.1:4040', dial: '100.64.0.2:4040' });
    await mine.setLink({ dial: '' });
    assert.deepEqual((await Sharing.open(keeper)).link, {});
  });
});
