// A plug-in adds a system that says who a person is (editor spec ES§40, five_layer_stack; §45, board_access). The
// registry holds it under its word. The contract refuses one that cannot name a person, or names two devices alike.
// What it says can only narrow what an invitation gives.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { identityBackendContract, identitySeat } from '../src/plugins-contract-identity.ts';
import { POINT_VERSIONS } from '../src/plugin-versions.ts';

/** A directory that knows each device by its key's last eight characters, and lets only some people edit. */
const directory = (most = async () => 'comment') => ({
  name: 'directory',
  title: 'Company directory',
  open: () => ({
    who: async (device) => ({ id: `staff-${device.slice(-8)}`, name: `Staff ${device.slice(-4)}` }),
    most,
  }),
});
const plugin = (b) => ({
  id: 'acme.directory',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['identity'],
  register: (points) => points.identity.add(b),
});
const failures = async (b) => {
  const failed = [];
  for (const check of identityBackendContract(b)) await check.run().catch((e) => failed.push(e.message));
  return failed;
};

describe('an identity system a plug-in adds', () => {
  test('it is versioned, offered under its word, and opened for use', () => {
    assert.equal(POINT_VERSIONS.identity, '1.0');
    const registry = pluginRegistry();
    registry.register(plugin(directory()));
    assert.deepEqual(
      registry.identities().map((b) => b.name),
      ['directory'],
    );
    assert.equal(typeof registry.openIdentity('directory').value?.who, 'function');
    assert.equal(registry.openIdentity('nobody').ok, false);
  });

  test('one with a name that is not a word, a name taken, or no way to open it is refused', () => {
    const registry = pluginRegistry();
    registry.register(plugin(directory()));
    const refused = [
      { ...plugin({ ...directory(), name: 'Bad Name' }), id: 'acme.bad' },
      { ...plugin(directory()), id: 'acme.again' },
      { ...plugin({ ...directory(), name: 'shut', open: undefined }), id: 'acme.shut' },
    ];
    for (const p of refused) assert.throws(() => registry.register(p), /was not installed/);
  });

  test('it passes every check of the identity contract', async () => {
    assert.deepEqual(await failures(directory()), []);
  });

  test('one that names no one, names every device alike, or gives a role that is not one fails a check', async () => {
    const giving = (who, most) => ({ ...directory(), open: () => ({ who, most }) });
    const broken = [
      giving(async () => ({ id: '', name: 'Nobody' })),
      giving(async () => ({ id: 'x'.repeat(65), name: 'Long' })),
      giving(async () => ({ id: 'same', name: 'Same' })),
      giving(
        async (d) => ({ id: d, name: 'Fine' }),
        async () => 'admin',
      ),
    ];
    for (const b of broken) assert.ok((await failures(b)).length > 0);
  });
});

describe('a seat an identity system gives', () => {
  test('it names the person, and its role only narrows the invitation', async () => {
    const id = directory().open();
    const seat = await identitySeat(id, `04${'ab'.repeat(64)}`, 'edit');
    assert.deepEqual(seat, { who: { id: 'staff-abababab', name: 'Staff abab' }, role: 'comment' });
    assert.equal((await identitySeat(id, '04ab', 'view')).role, 'view', 'never wider than the invitation');
    const editor = directory(async () => 'edit').open();
    assert.equal((await identitySeat(editor, '04ab', 'view')).role, 'view');
    const shut = directory(async () => null).open();
    assert.equal((await identitySeat(shut, '04ab', 'edit')).role, null, 'none at all');
  });

  test('with no say on roles, the invitation stands', async () => {
    const id = { who: async () => ({ id: 'a', name: 'A' }) };
    assert.equal((await identitySeat(id, '04ab', 'comment')).role, 'comment');
  });

  test('a person it cannot seat, or a role that is not one, stops by name', async () => {
    await assert.rejects(identitySeat({ who: async () => ({ id: 'a\u0007', name: 'A' }) }, '04', 'edit'), /identity/);
    const odd = { who: async () => ({ id: 'a', name: 'A' }), most: async () => 'owner' };
    await assert.rejects(identitySeat(odd, '04', 'edit'), /view, comment, edit or null/);
  });
});
