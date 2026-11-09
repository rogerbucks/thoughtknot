// Sharing at work in the app's window (editor spec ES§40 and ES§41; mesh_vpn_sync, board_live_together). Two apps hold
// one shared vault. Their notes are kept in Rust, here stood in for by the JavaScript build, and go over the mesh
// commands, here two in-memory relays. A write on one reaches the other's file. With no vault or no link, nothing runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '@thoughtknot/core';
import { Sharing } from '@thoughtknot/sync/sharing';
import { startShared } from '../src/app-shared.ts';
import { ctrHmac } from '../../sync/test/second-suite.js';
import { dialDevice, listenForDevice } from '../src/tauri-mesh.ts';
import { rustLike } from '../../sync/test/rust-like.js';
import { NOTE, TEXT } from '../../sync/test/helpers.js';
import { until } from '../../obsidian/test/host/load-plugin.js';

const keeperOf = () => {
  const keeper = { kept: null, load: async () => keeper.kept, save: async (k) => void (keeper.kept = k) };
  return keeper;
};
const shelvesOf = () => {
  const held = new Map();
  return {
    get: async (n) => held.get(n),
    put: async (n, r) => void held.set(n, r),
    names: async () => [...held.keys()],
  };
};

/** The mesh commands of apps on one network: a dial to an address reaches the app listening at it. */
function network() {
  const listeners = new Map();
  const ends = new Map();
  let next = 1;
  const pipe = () => {
    const [a, b] = [next++, next++];
    ends.set(a, { inbox: [], peer: b, waiting: [] });
    ends.set(b, { inbox: [], peer: a, waiting: [] });
    return [a, b];
  };
  return () => {
    const crdt = rustLike('this-device');
    const commands = {
      async mesh_listen({ address }) {
        const id = next++;
        listeners.set(address, { accepting: [], waiting: [] });
        listeners.get(address).id = id;
        return [id, address];
      },
      async mesh_accept({ listener }) {
        const l = [...listeners.values()].find((x) => x.id === listener);
        if (!l.accepting.length) await new Promise((wake) => l.waiting.push(wake));
        return l.accepting.shift();
      },
      async mesh_dial({ address }) {
        const l = listeners.get(address);
        if (!l) throw new Error('nobody is listening there');
        const [mine, theirs] = pipe();
        l.accepting.push(theirs);
        l.waiting.splice(0).forEach((wake) => wake());
        return mine;
      },
      async mesh_send({ connection, message }) {
        const far = ends.get(ends.get(connection).peer);
        far.inbox.push(message);
        far.waiting.splice(0).forEach((wake) => wake());
        return null;
      },
      async mesh_receive({ connection, ms }) {
        const end = ends.get(connection);
        if (!end.inbox.length) await new Promise((wake) => (end.waiting.push(wake), setTimeout(wake, ms)));
        return end.inbox.shift() ?? null;
      },
      async mesh_close() {
        return null;
      },
    };
    return async (command, args) => (command.startsWith('crdt_') ? crdt.call(command, args) : commands[command](args));
  };
}

/** Two devices of one owner, each with the other trusted and the link set. */
async function owners(link = true) {
  const [ka, kb] = [keeperOf(), keeperOf()];
  const a = await Sharing.start(ka);
  const b = await Sharing.prepare(kb);
  await a.trust(b.publicKey);
  await b.trust(a.publicKey);
  assert.equal(await b.accept(await a.invite('Plan', 'edit', b.publicKey)), undefined);
  if (link) {
    await a.setLink({ listen: '100.64.0.1:4040', dial: '100.64.0.2:4040' });
    await b.setLink({ listen: '100.64.0.2:4040', dial: '100.64.0.1:4040' });
  }
  const mesh = network();
  const start = (keeper, recipe) => startShared({ invoke: mesh(), keeper, shelves: shelvesOf(), recipe });
  return { ka, kb, start, mesh };
}

// proves: mesh_vpn_sync
test('a write on one app reaches the other app’s file', async () => {
  const { ka, kb, start } = await owners();
  const [one, two] = [await start(ka), await start(kb)];
  const files = [memoryStorage({ [NOTE]: TEXT }), memoryStorage({ [NOTE]: TEXT })];
  const [first, second] = [one.layer(files[0]), two.layer(files[1])];
  await first.read(NOTE);
  await second.read(NOTE);
  const done = await first.write(NOTE, `${TEXT}Bread\n`);
  assert.equal(done.ok, true);
  await until(async () => (await files[1].read(NOTE)).text === `${TEXT}Bread\n`);
  await one.stop();
  await two.stop();
});

// proves: board_live_together
test('a board gets its seat once the note is open for sharing', async () => {
  const { ka, start } = await owners();
  const app = await start(ka);
  assert.equal(app.seat(NOTE, 'Plan'), undefined, 'the note is not open yet');
  await app.layer(memoryStorage({ [NOTE]: TEXT })).read(NOTE);
  assert.ok(app.seat(NOTE, 'Plan'));
  assert.equal(app.seat(NOTE, 'Plan'), app.seat(NOTE, 'Plan'), 'one seat for one board');
  await app.stop();
});

// proves: mesh_vpn_sync
test('with no vault, no link or nowhere to keep records, nothing runs', async () => {
  const { ka, start } = await owners(false);
  assert.equal(await start(ka), undefined, 'no link set');
  assert.equal(await start(keeperOf()), undefined, 'no vault');
  assert.equal(await startShared({ invoke: network()(), keeper: ka, shelves: undefined }), undefined, 'no shelves');
  assert.equal(await startShared({ invoke: network()(), keeper: undefined, shelves: shelvesOf() }), undefined);
});

/** A suite that counts what it seals, to show it is the one at work. */
const counting = (suite) => {
  const seen = { sealed: 0 };
  return { seen, suite: { ...suite, seal: (...a) => (seen.sealed++, suite.seal(...a)) } };
};

// proves: encrypted_everywhere
test('two apps share over a chosen cipher suite, and it is the one that seals', async () => {
  const { ka, kb, start } = await owners();
  const [one, two] = [counting(ctrHmac), counting(ctrHmac)];
  const [a, b] = [await start(ka, { suite: one.suite }), await start(kb, { suite: two.suite })];
  const files = [memoryStorage({ [NOTE]: TEXT }), memoryStorage({ [NOTE]: TEXT })];
  const [first, second] = [a.layer(files[0]), b.layer(files[1])];
  await first.read(NOTE);
  await second.read(NOTE);
  await first.write(NOTE, `${TEXT}Eggs\n`);
  await until(async () => (await files[1].read(NOTE)).text === `${TEXT}Eggs\n`);
  assert.ok(one.seen.sealed > 0 && two.seen.sealed > 0, 'both apps sealed with the chosen suite');
  await a.stop();
  await b.stop();
});

// proves: encrypted_everywhere
test('a cipher suite that fails its contract is refused at the start', async () => {
  const { ka, start } = await owners();
  const plain = {
    id: 'aes-256-gcm',
    newKey: async () => ({}),
    keyFrom: async () => ({}),
    seal: async (_k, p) => p,
    open: async (_k, s) => s,
  };
  await assert.rejects(start(ka, { suite: plain }), /is refused/);
});

// proves: mesh_vpn_sync
test('the apps reach each other over a transport the person brings', async () => {
  const { ka, kb, start, mesh } = await owners();
  const calls = { dials: 0, listens: 0 };
  const via = (invoke) => ({
    dial: (address) => (calls.dials++, dialDevice(invoke, address)),
    listen: (address) => (calls.listens++, listenForDevice(invoke, address)),
  });
  const shared = mesh();
  const [a, b] = [await start(ka, { transport: via(shared) }), await start(kb, { transport: via(shared) })];
  assert.ok(calls.listens > 0, 'the brought transport listened');
  await a.stop();
  await b.stop();
});
