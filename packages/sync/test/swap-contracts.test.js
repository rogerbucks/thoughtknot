// The contracts a swapped part of sync is held to (editor spec ES§40, five_layer_stack). Each build of a record store,
// a channel and a keeper that ships runs the one contract. So a person can bring another build, and it is held to the
// same promises. A build that breaks a promise fails here by name.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DeviceKeys,
  FolderStore,
  KeptStore,
  MemoryStore,
  SealedStore,
  Session,
  VaultKey,
  acceptedSuite,
  defaultSuite,
  suiteProblems,
} from '../src/index.ts';
import { channelContract, keeperContract, shelfContract, storeContract } from '../src/contracts.ts';
import { suiteContract } from '../src/suite-contract.ts';
import { nodeFiles } from './helpers.js';

const run = (name, checks) => describe(name, () => checks.forEach((c) => test(c.name, c.run)));

const shelves = () => {
  const held = new Map();
  return {
    get: async (n) => held.get(n),
    put: async (n, r) => void held.set(n, r),
    names: async () => [...held.keys()],
  };
};
const folder = async () => new FolderStore(nodeFiles(await mkdtemp(join(tmpdir(), 'tk-store-'))));

/** Two ends of a channel in memory: a message sent on one is heard on the other, and closing tells the other. */
function pair() {
  const ends = [0, 1].map(() => ({ heard: null, closed: null, shut: false }));
  const end = (me, other) => ({
    send: (m) => {
      if (!ends[me].shut) queueMicrotask(() => ends[other].heard?.(m.slice()));
    },
    listen: (heard, closed) => {
      ends[me].heard = heard;
      ends[me].closed = closed;
    },
    close: () => {
      if (ends[me].shut) return;
      ends[me].shut = true;
      queueMicrotask(() => ends[other].closed?.());
    },
  });
  return [end(0, 1), end(1, 0)];
}

const memoryKeeper = () => {
  const keeper = { kept: null, load: async () => keeper.kept, save: async (k) => void (keeper.kept = k) };
  return keeper;
};

// proves: local_encrypted_store
run(
  'the memory store keeps records',
  storeContract(() => new MemoryStore()),
);
// proves: local_encrypted_store
run(
  'the kept store keeps records',
  storeContract(() => new KeptStore(shelves())),
);
// proves: local_encrypted_store
run('the folder store keeps records', storeContract(folder));
// proves: local_encrypted_store
run(
  'the sealed store keeps records',
  storeContract(async () => new SealedStore(new MemoryStore(), await VaultKey.create())),
);
// proves: mesh_vpn_sync
run(
  'the memory store shelves records',
  shelfContract(() => new MemoryStore()),
);
// proves: mesh_vpn_sync
run(
  'the kept store shelves records',
  shelfContract(() => new KeptStore(shelves())),
);
// proves: mesh_vpn_sync
run('the folder store shelves records', shelfContract(folder));
// proves: mesh_vpn_sync
run('a channel in memory carries whole messages', channelContract(pair));
// proves: board_access
run('a keeper in memory keeps what it is given', keeperContract(memoryKeeper));

test('the contracts name a part that breaks a promise', async () => {
  const lossy = { add: async () => {}, records: async () => [] };
  const named = [];
  for (const check of storeContract(() => lossy)) await check.run().catch(() => named.push(check.name));
  assert.ok(
    named.some((n) => /byte for byte/.test(n)),
    'a store that keeps nothing fails the read-back check',
  );
});

// proves: encrypted_everywhere
run(
  'the shipped cipher suite seals and opens safely',
  suiteContract(() => defaultSuite),
);

/** A second, real suite: AES-CTR sealed, then HMAC-SHA-256 over nonce, ciphertext and bound data. */
const ctrHmac = (() => {
  const subtle = globalThis.crypto.subtle;
  const join = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
  const split = async (raw) => ({
    enc: await subtle.importKey('raw', raw.slice(0, 16), 'AES-CTR', false, ['encrypt', 'decrypt']),
    mac: await subtle.importKey('raw', raw.slice(16), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  });
  const tag = async (k, iv, body, bound = new Uint8Array()) =>
    new Uint8Array(await subtle.sign('HMAC', k.mac, join(iv, body, bound, Uint8Array.of(bound.length))));
  return {
    id: 'aes-ctr-hmac',
    keyFrom: (raw) => split(raw),
    newKey: () => split(globalThis.crypto.getRandomValues(new Uint8Array(48))),
    async seal(k, plain, bound) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const body = new Uint8Array(await subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, k.enc, plain));
      return join(iv, body, await tag(k, iv, body, bound));
    },
    async open(k, sealed, bound) {
      if (sealed.length < 48) throw new Error('too short');
      const [iv, body, got] = [sealed.slice(0, 16), sealed.slice(16, -32), sealed.slice(-32)];
      const want = await tag(k, iv, body, bound);
      if (!want.every((v, i) => v === got[i])) throw new Error('refused');
      return new Uint8Array(await subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, k.enc, body));
    },
  };
})();

// proves: encrypted_everywhere
run(
  'a second suite, AES-CTR with HMAC, passes the same contract',
  suiteContract(() => ctrHmac),
);

describe('a chosen suite carries the vault key and the session', () => {
  // proves: encrypted_everywhere
  test('a vault key made with the second suite seals and opens, and the default cannot open it', async () => {
    const key = await VaultKey.create(ctrHmac);
    const sealed = await key.seal(new TextEncoder().encode('hello'));
    assert.equal(new TextDecoder().decode(await key.open(sealed)), 'hello');
    const other = await VaultKey.create();
    await assert.rejects(other.open(sealed));
  });
  // proves: encrypted_everywhere
  test('two devices talk in a session sealed by the second suite', async () => {
    const [a, b] = [await DeviceKeys.create(), await DeviceKeys.create()];
    const [ba, bb] = [await Session.begin(), await Session.begin()];
    const sa = await Session.open(a, b.publicKey, ba, bb.hello, ctrHmac);
    const sb = await Session.open(b, a.publicKey, bb, ba.hello, ctrHmac);
    const msg = new TextEncoder().encode('over the mesh');
    assert.equal(new TextDecoder().decode(await sb.open(await sa.seal(msg))), 'over the mesh');
    const wrong = await Session.open(b, a.publicKey, bb, ba.hello);
    await assert.rejects(wrong.open(await sa.seal(msg)));
  });
});

describe('a cipher suite is accepted only when it passes the contract', () => {
  /** A suite that hides nothing: sealed bytes are the plain bytes. */
  const plain = {
    id: 'aes-256-gcm',
    newKey: async () => ({}),
    seal: async (_k, p) => p.slice(),
    open: async (_k, s) => s.slice(),
  };
  // proves: encrypted_everywhere
  test('a suite that hides nothing is refused, whatever it is called', async () => {
    const problems = await suiteProblems(plain);
    assert.ok(problems.length > 0, 'it fails some checks');
    await assert.rejects(acceptedSuite(plain), /is refused/);
  });
  // proves: encrypted_everywhere
  test('a suite named none is refused by its name', async () => {
    const named = { ...defaultSuite, id: 'none' };
    const problems = await suiteProblems(named);
    assert.ok(problems.some((p) => /not as a way of hiding nothing/.test(p)));
  });
  // proves: encrypted_everywhere
  test('a suite that opens what was changed is refused', async () => {
    const lax = {
      ...defaultSuite,
      open: async (key, sealed, bound) => defaultSuite.open(key, sealed, bound).catch(() => new Uint8Array()),
    };
    const problems = await suiteProblems(lax);
    assert.ok(problems.some((p) => /changed byte/.test(p)));
  });
  // proves: encrypted_everywhere
  test('the shipped suite is accepted', async () => {
    assert.equal(await acceptedSuite(defaultSuite), defaultSuite);
  });
});
