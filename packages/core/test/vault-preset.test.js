// The view preset a vault chooses for itself (editor spec ES§69, view_presets_scoped).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VAULT_PRESET_PLACE, presetIn, presetInUse, vaultPresetFile, vaultPresetId } from '../src/vault-preset.ts';

describe('the vault’s preset file', () => {
  // proves: view_presets_scoped
  test('names a starter, and a file read back gives that starter', () => {
    assert.equal(VAULT_PRESET_PLACE, 'ThoughtKnot view preset.json');
    for (const id of ['default', 'focus', 'calm', 'detail', 'big-picture', 'reading'])
      assert.equal(vaultPresetId(vaultPresetFile(id)), id);
  });

  // proves: view_presets_scoped
  test('is untrusted: no file, a file that is not a preset, or one naming no starter gives nothing', () => {
    assert.equal(vaultPresetId(undefined), undefined);
    assert.equal(vaultPresetId(null), undefined);
    assert.equal(vaultPresetId(''), undefined);
    assert.equal(vaultPresetId('not json'), undefined);
    assert.equal(vaultPresetId('{"format": "something else"}'), undefined);
    const stranger = vaultPresetFile('calm').replace('"id": "calm"', '"id": "mine"');
    assert.equal(vaultPresetId(stranger), undefined, 'only a starter’s id is taken from a file');
  });
});

describe('which preset is in use', () => {
  // proves: view_presets_scoped
  test('says the nearest choice: the graph’s, then the vault’s, then the settings’, then the built-in', () => {
    assert.deepEqual(presetIn({ graph: 'detail', vault: 'calm', everywhere: 'focus' }), {
      id: 'detail',
      scope: 'graph',
    });
    assert.deepEqual(presetIn({ vault: 'calm', everywhere: 'focus' }), { id: 'calm', scope: 'vault' });
    assert.deepEqual(presetIn({ everywhere: 'focus' }), { id: 'focus', scope: 'everywhere' });
    assert.deepEqual(presetIn({ everywhere: 'default' }), { id: 'default', scope: 'built-in' });
    assert.deepEqual(presetIn({}), { id: 'default', scope: 'built-in' });
  });

  // proves: view_presets_scoped
  test('is said in one line naming the preset and who chose it', () => {
    assert.equal(presetInUse({ vault: 'calm' }), 'In use: Calm and predictable, chosen by this vault.');
    assert.equal(presetInUse({}), 'In use: Default, chosen by the built-in default.');
  });
});
