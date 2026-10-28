// Data is sealed at rest and on the wire, and keys never leave the owner's devices (editor spec §40,
// encrypted_everywhere). The vault key's bytes are watched as they are made. They must appear in no file kept or
// carried, in no log or JSON of a key, and in no key sealed for another device. Another device opens the vault only by
// its own key pair, and a device's private key cannot be exported.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { readFileSync } from 'node:fs';
import { DeviceKeys, MemoryStore, VaultKey, syncedOver } from '../src/index.ts';
import { NOTE, TEXT } from './helpers.js';

/** Runs `make` and gives what it made with every run of random bytes it drew, as the vault key draws its own. */
async function watchingRandom(make) {
  const drawn = [];
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  globalThis.crypto.getRandomValues = (a) => {
    const out = real(a);
    drawn.push(Buffer.from(out.buffer, out.byteOffset, out.byteLength).toString('hex'));
    return out;
  };
  try {
    return { made: await make(), drawn };
  } finally {
    globalThis.crypto.getRandomValues = real;
  }
}

/** Every way bytes might be written down: hex, base64 and as they are. */
const forms = (hex) => [hex, Buffer.from(hex, 'hex').toString('base64'), Buffer.from(hex, 'hex').toString('latin1')];

describe('encrypted_everywhere', () => {
  // proves: encrypted_everywhere
  test('data at rest and on the wire is sealed, and no key appears in any export, log or file', async () => {
    const { made: key, drawn } = await watchingRandom(() => VaultKey.create());
    const [bytes] = drawn;
    assert.equal(bytes.length, 64, 'the vault key is 32 random bytes');
    const store = new MemoryStore();
    const notes = syncedOver(store, key, 'desktop');
    await notes.open(NOTE, TEXT);
    await notes.edit(NOTE, 0, 0, 'Private.\n', 'Roger');

    // what is kept, and what Syncthing carries, is the same sealed files
    const kept = [...store.files.entries()].flatMap(([n, d]) => [
      n,
      ...[...d.entries()].flatMap(([dev, r]) => [dev, ...r]),
    ]);
    const said = kept.map((k) => (typeof k === 'string' ? k : Buffer.from(k).toString('latin1'))).join('\n');
    for (const word of ['Private', 'Widget', 'Shop', 'desktop', 'Roger']) assert.ok(!said.includes(word), word);
    for (const f of forms(bytes)) assert.ok(!said.includes(f), 'the key is in no file');

    // a log, JSON or an export of a key says only that it is one
    const logs = [JSON.stringify({ key }), String(key), inspect(key), inspect({ key }, { depth: 5, showHidden: true })];
    for (const line of logs) {
      assert.match(line, /never shown/);
      for (const f of forms(bytes)) assert.ok(!line.includes(f), 'the key is in no log');
    }
  });

  // proves: encrypted_everywhere
  test('the vault reaches another device only sealed for that device’s own key pair', async () => {
    const { made: key, drawn } = await watchingRandom(() => VaultKey.create());
    const [desk, phone, stranger] = await Promise.all([DeviceKeys.create(), DeviceKeys.create(), DeviceKeys.create()]);
    const sealed = await key.sealFor(desk, phone.publicKey);
    const latin = Buffer.from(sealed).toString('latin1');
    for (const f of forms(drawn[0])) assert.ok(!latin.includes(f), 'the key is never carried in the clear');

    const onPhone = await VaultKey.openFrom(sealed, phone, desk.publicKey);
    const record = await key.seal(new TextEncoder().encode('kept on the desktop'));
    assert.equal(new TextDecoder().decode(await onPhone.open(record)), 'kept on the desktop');
    assert.equal(await onPhone.hide(NOTE), await key.hide(NOTE), 'both hide a name alike');
    await assert.rejects(VaultKey.openFrom(sealed, stranger, desk.publicKey), 'another device cannot open it');
  });

  // proves: encrypted_everywhere
  test('a device’s private key cannot be exported, and its key pair says only that it is a key', async () => {
    const device = await DeviceKeys.create();
    assert.equal(device.publicKey.length, 65, 'the public half is shared, as raw P-256');
    assert.match(JSON.stringify(device), /never shown/);
    assert.match(inspect(device, { showHidden: true }), /never shown/);
    const source = readFileSync(new URL('../src/keys.ts', import.meta.url), 'utf8');
    assert.match(source, /generateKey\(\s*\{ name: 'ECDH', namedCurve: 'P-256' \},\s*false,/, 'made unexportable');
    assert.doesNotMatch(source, /exportKey\('(pkcs8|jwk)'/, 'no private half is ever exported');
  });
});
