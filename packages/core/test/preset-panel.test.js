// The view preset panel, one for every host (editor spec ES§69, view_presets_portable, view_presets_scoped).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PresetPanel } from '../src/preset-panel.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';

/** A panel over settings kept in a variable, with a vault file kept in another, and what the host was asked to do. */
function panel(start = {}) {
  const seen = { saved: 0, drawn: 0, shared: [], vault: undefined };
  const state = { s: { ...DEFAULT_SETTINGS, ...start } };
  const p = new PresetPanel({
    settings: () => state.s,
    save: async (next) => {
      state.s = next;
      seen.saved++;
    },
    update: () => void seen.drawn++,
    share: async (text) => void seen.shared.push(text),
    vault: () => seen.vault,
    setVault: async (id) => void (seen.vault = id ?? undefined),
  });
  return { p, state, seen };
}
const row = (p, name) => p.rows().find((r) => r.name === name);
const press = async (p, name) => {
  row(p, name).action();
  await new Promise((r) => setTimeout(r, 0));
};

describe('the preset panel', () => {
  // proves: view_presets_predictable
  test('shows what a pick would change first, and changes nothing until it is used', () => {
    const { p, state, seen } = panel({ viewPreset: 'default' });
    p.pick('calm');
    assert.equal(p.shown(), 'calm');
    assert.equal(state.s.viewPreset, 'default', 'nothing is changed by a pick');
    assert.equal(seen.saved, 0);
    assert.ok(
      p.rows().some((r) => /Before you use/.test(r.name)),
      'the change in hand is named',
    );
    p.pick('default');
    assert.equal(p.pending, null, 'picking the one in use drops the pick');
  });

  // proves: view_presets_predictable
  test('is used when asked, and one press puts every setting back', async () => {
    const { p, state } = panel({ viewPreset: 'default' });
    const before = { ...state.s };
    p.pick('focus');
    await press(p, 'Use this preset');
    assert.equal(state.s.viewPreset, 'focus');
    await press(p, 'Undo the preset change');
    assert.deepEqual(state.s, before);
    assert.equal(row(p, 'Undo the preset change'), undefined, 'one step back, not more');
  });

  // proves: view_presets_scoped
  test('says who chose the preset in use, and writes or removes the vault’s', async () => {
    const { p, seen } = panel({ viewPreset: 'focus' });
    assert.match(row(p, 'View preset in use').desc, /chosen by your settings/);
    assert.equal(row(p, 'Stop using a vault preset'), undefined);
    await press(p, 'Use this preset for the whole vault');
    assert.equal(seen.vault, 'focus');
    assert.match(row(p, 'View preset in use').desc, /chosen by this vault/);
    await press(p, 'Stop using a vault preset');
    assert.equal(seen.vault, undefined);
  });

  // proves: view_presets_portable
  test('exports the preset in use as one file, and offers Your own only once one is read in', async () => {
    const { p, seen } = panel({ viewPreset: 'calm' });
    assert.equal(p.offers('own'), false);
    assert.equal(p.offers('calm'), true);
    p.ownRows()
      .find((r) => r.action)
      .action();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(seen.shared.length, 1);
    assert.match(seen.shared[0], /thoughtknot-view-preset@1/);
  });
});
