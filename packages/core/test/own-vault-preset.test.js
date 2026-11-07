// A vault names a preset of its own (view_presets_own_vault).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { vaultOwnFile, vaultOwnPreset, VAULT_PRESET_MOST } from '../src/own-vault-preset.ts';
import { vaultPresetFile, vaultPresetId } from '../src/vault-preset.ts';
import { STARTERS, presetFile } from '../src/view-presets.ts';

const calm = STARTERS.find((p) => p.id === 'calm');
const mine = { ...calm, id: 'own:evening', name: 'Evening' };

describe('a preset the vault names for itself', () => {
  test('is the whole preset the one small file holds, under an id of its own', () => {
    const read = vaultOwnPreset(vaultOwnFile(mine));
    assert.equal(read.name, 'Evening');
    assert.equal(read.id, 'vault:evening');
    assert.deepEqual(read.chain, mine.chain);
  });

  test('is nothing when there is no file, or it is not a preset file', () => {
    assert.equal(vaultOwnPreset(undefined), undefined);
    assert.equal(vaultOwnPreset(''), undefined);
    assert.equal(vaultOwnPreset('not json'), undefined);
    assert.equal(vaultOwnPreset('{"format":"other"}'), undefined);
  });

  test('is left to the starter route when the file names a starter', () => {
    const file = vaultPresetFile('calm');
    assert.equal(vaultOwnPreset(file), undefined);
    assert.equal(vaultPresetId(file), 'calm');
  });

  test('is read as untrusted: a file that asks for less than the floor is raised to it', () => {
    const weak = JSON.parse(vaultOwnFile(mine));
    weak.chain.formatting = { contrast: 'none' };
    const read = vaultOwnPreset(JSON.stringify(weak));
    assert.equal(read.chain.formatting.contrast, 'AA');
  });

  test('stays small: a file over the limit is not read', () => {
    const padded = JSON.stringify({ ...JSON.parse(presetFile(mine)), pad: 'x'.repeat(VAULT_PRESET_MOST) });
    assert.equal(vaultOwnPreset(padded), undefined);
  });

  test('counts bytes, not letters, and keeps no empty id', () => {
    const wide = JSON.stringify({ ...JSON.parse(presetFile(mine)), pad: 'é'.repeat(VAULT_PRESET_MOST / 2) });
    assert.ok(wide.length < VAULT_PRESET_MOST + 500);
    assert.equal(vaultOwnPreset(wide), undefined);
    assert.equal(vaultOwnPreset(presetFile({ ...mine, id: 'vault:' })), undefined);
  });
});
