// What changing view preset would change, said before it does (editor spec §69): view-preset-preview.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { presetPreview, presetUndo } from '../src/view-preset-preview.ts';
import { presetChange } from '../src/view-presets.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';

describe('a view preset picked', () => {
  // proves: view_presets_predictable
  test('says each setting it would change, from what to what, in words, and only those', () => {
    const lines = presetPreview(DEFAULT_SETTINGS, 'calm');
    assert.equal(lines[0].key, 'viewPreset');
    const direction = lines.find((l) => l.key === 'direction');
    assert.deepEqual([direction.name, typeof direction.from, typeof direction.to], ['Direction', 'string', 'string']);
    assert.notEqual(direction.from, direction.to);
    for (const l of lines) assert.notEqual(DEFAULT_SETTINGS[l.key], presetChange('calm')[l.key], l.key);
    assert.deepEqual(presetPreview(DEFAULT_SETTINGS, 'default'), [], 'the preset in use changes nothing');
  });

  // proves: view_presets_predictable
  test('is undone in one step: every setting it changed put back', () => {
    const used = { ...DEFAULT_SETTINGS, ...presetChange('calm') };
    assert.deepEqual({ ...used, ...presetUndo(DEFAULT_SETTINGS, 'calm') }, DEFAULT_SETTINGS);
  });
});
