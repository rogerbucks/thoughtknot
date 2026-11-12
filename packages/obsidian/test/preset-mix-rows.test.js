// Mixing two view presets on Obsidian's settings page (editor spec ES§74, presets_mix). The page takes each part from
// one preset or the other and says each clash with its winner. Keep the mix saves it like any own preset, picked from
// the same list. Nothing is saved until then.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';

before(() => build());

const rowsOf = (tab) => tab.getSettingDefinitions().flatMap((g) => g.items ?? [g]);
const row = (tab, name) => rowsOf(tab).find((r) => r.name === name);

describe('mixing two presets in Obsidian (presets_mix)', () => {
  test('a mix keeps the parts chosen, says a clash and its winner, and is saved like any preset', async () => {
    const { state, plugin, uninstall } = await load({ files: {} });
    try {
      const tab = state.settingTabs[0];
      assert.ok(row(tab, 'Mix two presets'), 'the mix is offered');
      assert.equal(tab.getControlValue('presetMix.first'), 'calm');
      assert.equal(tab.getControlValue('presetMix.second'), 'focus');
      const before = plugin.settings.ownPresets;
      // focus support from the second, and its order, which clashes with Calm's pinned layout
      await tab.setControlValue('presetMix.part.detail', 'second');
      await tab.setControlValue('presetMix.part.ordering', 'second');
      assert.equal(plugin.settings.ownPresets, before, 'nothing is saved while the mix is made');
      assert.match(row(tab, 'When two parts clash').desc, /Layout from Calm.* wins, so Order comes from Calm/);
      await tab.setControlValue('presetMix.winner', 'second');
      assert.match(row(tab, 'When two parts clash').desc, /Order from Focus.* wins, so Layout comes from Focus/);
      row(tab, 'Keep the mix').action();
      await until(() => plugin.settings.ownPresets !== before);
      const kept = JSON.parse(plugin.settings.ownPresets).items;
      assert.equal(kept.length, 1);
      assert.equal(kept[0].chain.ordering, 'hubs');
      assert.deepEqual(kept[0].chain.detail, { reach: 2, rest: 'blurred', labels: 'by-zoom' });
      assert.deepEqual(kept[0].chain.motion, { mode: 'off', glideMs: 0 });
      // it is offered with the others, to pick like any preset
      const picker = rowsOf(tab).find((r) => r.control?.key === 'viewPreset');
      assert.ok(Object.values(picker.control.options).includes(kept[0].name));
    } finally {
      await wait(50); // the page reads the AI matrix note on drawing, which ends after the checks
      plugin.onunload();
      uninstall();
    }
  });
});
