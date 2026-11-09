// A plug-in adds a way between devices (editor spec ES§40, five_layer_stack). The registry holds it under its word,
// and the contract refuses a transport that does not carry every message whole and in order, both ways.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { transportBackendContract } from '../src/plugins-contract-transport.ts';
import { POINT_VERSIONS } from '../src/plugin-versions.ts';

/** A channel end that hands each message to the other end in a later turn, and tells it when it closes. */
function pair() {
  const ends = [{}, {}].map(() => ({ heard: () => {}, closed: () => {}, open: true }));
  const end = (me, other) => ({
    send: (m) => me.open && queueMicrotask(() => other.heard(Uint8Array.from(m))),
    listen: (heard, closed) => Object.assign(me, { heard, closed }),
    close: () => {
      me.open = false;
      queueMicrotask(() => other.closed());
    },
  });
  return [end(ends[0], ends[1]), end(ends[1], ends[0])];
}
/** A transport in memory: one listener, whose accepted end is the other of each dialled pair. */
function memoryTransport() {
  const waiting = [];
  let wake = () => {};
  return {
    dial: async () => {
      const [a, b] = pair();
      waiting.push(b);
      wake();
      return a;
    },
    listen: async (address) => ({
      address,
      next: async () => {
        while (!waiting.length) await new Promise((r) => (wake = r));
        return waiting.shift();
      },
      stop: async () => {},
    }),
  };
}
const relay = { name: 'relay', title: 'Relay', open: memoryTransport };
const plugin = (b) => ({
  id: 'acme.relay',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['transport'],
  register: (points) => points.transport.add(b),
});

describe('a transport a plug-in adds', () => {
  test('it is versioned, offered under its word, and opened for use', () => {
    assert.equal(POINT_VERSIONS.transport, '1.0');
    const registry = pluginRegistry();
    registry.register(plugin(relay));
    assert.deepEqual(
      registry.transports().map((b) => b.name),
      ['relay'],
    );
    assert.equal(typeof registry.openTransport('relay').value?.dial, 'function');
    assert.equal(registry.openTransport('nobody').ok, false);
  });

  test('one with a name that is not a word, a name taken, or no way to open it is refused', () => {
    const registry = pluginRegistry();
    registry.register(plugin(relay));
    const refused = [
      { ...plugin({ ...relay, name: 'Bad Name' }), id: 'acme.bad' },
      { ...plugin(relay), id: 'acme.again' },
      { ...plugin({ ...relay, name: 'shut', open: undefined }), id: 'acme.shut' },
    ];
    for (const p of refused) assert.throws(() => registry.register(p), /was not installed/);
  });

  test('it passes every check of the transport contract', async () => {
    for (const check of transportBackendContract(relay)) await check.run();
  });

  test('a transport that drops a message, or never tells the other end it closed, fails a check', async () => {
    const dropping = () => {
      const t = memoryTransport();
      return {
        ...t,
        dial: async (a) => {
          const c = await t.dial(a);
          return { ...c, send: () => {} };
        },
      };
    };
    const silent = () => {
      const t = memoryTransport();
      return {
        ...t,
        dial: async (a) => {
          const c = await t.dial(a);
          return { ...c, close: () => {} };
        },
      };
    };
    for (const open of [dropping, silent]) {
      const failed = [];
      for (const check of transportBackendContract({ ...relay, open }))
        await check.run().catch((e) => failed.push(e.message));
      assert.ok(failed.length > 0);
    }
  });
});
