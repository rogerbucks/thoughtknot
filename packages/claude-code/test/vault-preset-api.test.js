// The vault's view preset in the browser editor (editor spec ES§69, view_presets_scoped, view_presets_portable). It is
// the one thing besides an export the page may write, so each way it could write more is tried on a real vault on disk:
// - only a starter's id is taken, and the file is written by the server from the core's starters;
// - the name is the server's own, at the vault's top, whatever the address says;
// - a link is never read or written through;
// - only the page's own key writes.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NoteStore } from '../server/editor-store.ts';
import { startEditorServer } from '../server/start-server.ts';
import { VaultPresetApi, withVaultPreset } from '../server/vault-preset-api.ts';
import { vaultPresetFile } from '../../core/src/vault-preset.ts';
import { ask } from './editor-threats-support.js';
import { bearer, handWatch, tempVault, writing } from './editor-store-support.js';

const PLACE = 'ThoughtKnot view preset.json';

/** A store over a real vault and a server serving the vault preset beside it. */
async function serving(v) {
  const store = await NoteStore.create({ vault: v.vault, drafts: v.data, watch: handWatch().watch });
  const server = await startEditorServer({
    api: withVaultPreset(new VaultPresetApi(store.vault), store.api),
    drain: () => store.stop(),
  });
  after(() => server.stop());
  return { server, vault: store.vault };
}
const get = (s, path = '/api/vault-preset') => ask(s.port, { path, headers: bearer(s) });
const put = (s, body, path = '/api/vault-preset', headers = { ...writing(s), 'content-type': 'application/json' }) =>
  ask(s.port, { method: 'PUT', path, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('the vault preset’s route', () => {
  // proves: view_presets_scoped
  test('says none for a vault with no file, then a starter once one is made, and none once it is removed', async () => {
    const v = tempVault();
    const { server, vault } = await serving(v);
    assert.deepEqual(JSON.parse((await get(server)).text), { id: null });
    const made = await put(server, { id: 'calm' });
    assert.equal(made.status, 200, made.text);
    assert.equal(readFileSync(join(vault, PLACE), 'utf8'), vaultPresetFile('calm'), 'written by the server');
    assert.deepEqual(JSON.parse((await get(server)).text), { id: 'calm' });
    assert.equal((await put(server, { id: 'focus' })).status, 200, 'a second choice replaces the first');
    assert.deepEqual(JSON.parse((await get(server)).text), { id: 'focus' });
    assert.equal((await put(server, { id: null })).status, 200);
    assert.equal(existsSync(join(vault, PLACE)), false);
    assert.deepEqual(JSON.parse((await get(server)).text), { id: null });
    assert.deepEqual(
      readdirSync(vault).filter((n) => n.includes('.tmp')),
      [],
      'no half-written file is left',
    );
  });

  // proves: view_presets_scoped
  test('takes only a starter’s id: anything else is refused and nothing is written', async () => {
    const v = tempVault();
    const { server, vault } = await serving(v);
    for (const body of [
      { id: 'mine' },
      { id: '../../outside/evil' },
      { id: 7 },
      { id: ['calm'] },
      { text: vaultPresetFile('calm') },
      {},
      [],
      'not json',
      '',
    ]) {
      const got = await put(server, body);
      assert.equal(got.status, 400, JSON.stringify(body));
    }
    assert.equal(existsSync(join(vault, PLACE)), false);
  });

  // proves: view_presets_scoped
  test('keeps to its own name: no address reaches another file, whatever it spells', async () => {
    const v = tempVault();
    const { server, vault } = await serving(v);
    for (const path of [
      '/api/vault-preset/extra',
      '/api/vault-preset/..%2Fsecret.md',
      '/api/vault-preset%2f..%2fNotes%2fplan.md',
      '/api/vault-preset/../notes/x',
      '/api/Vault-Preset',
    ]) {
      const got = await put(server, { id: 'calm' }, path);
      assert.notEqual(got.status, 200, path);
    }
    assert.equal(existsSync(join(vault, PLACE)), false);
    assert.equal(readFileSync(join(v.outside, 'secret.md'), 'utf8').length > 0, true);
  });

  // proves: view_presets_scoped
  test('never reads or writes through a link at its place', async () => {
    const v = tempVault();
    const { server, vault } = await serving(v);
    const secret = join(v.outside, 'secret.md');
    const before = readFileSync(secret, 'utf8');
    symlinkSync(secret, join(vault, PLACE));
    assert.deepEqual(JSON.parse((await get(server)).text), { id: null }, 'a link is read as no file');
    assert.equal((await put(server, { id: 'calm' })).status, 403);
    assert.equal((await put(server, { id: null })).status, 403);
    assert.equal(readFileSync(secret, 'utf8'), before, 'what the link points at is untouched');
    assert.equal(lstatSync(join(vault, PLACE)).isSymbolicLink(), true, 'and the link is left as it was');
  });

  // proves: view_presets_scoped
  test('reads a file that is not a preset as none, and replaces it only with a starter', async () => {
    const v = tempVault();
    const { server, vault } = await serving(v);
    writeFileSync(join(vault, PLACE), '{"format": "something else"}');
    assert.deepEqual(JSON.parse((await get(server)).text), { id: null });
    assert.equal((await put(server, { id: 'detail' })).status, 200);
    assert.deepEqual(JSON.parse((await get(server)).text), { id: 'detail' });
  });

  // proves: view_presets_scoped
  test('is written only with the page’s own key and the server’s own origin', async () => {
    const v = tempVault();
    const { server, vault } = await serving(v);
    const readOnly = await put(server, { id: 'calm' }, '/api/vault-preset', {
      ...bearer(server),
      'content-type': 'application/json',
    });
    assert.notEqual(readOnly.status, 200, 'a read key does not write');
    const strangers = await put(server, { id: 'calm' }, '/api/vault-preset', {
      ...writing(server),
      origin: 'http://evil.example',
      'content-type': 'application/json',
    });
    assert.notEqual(strangers.status, 200, 'another origin does not write');
    assert.equal(existsSync(join(vault, PLACE)), false);
  });
});
