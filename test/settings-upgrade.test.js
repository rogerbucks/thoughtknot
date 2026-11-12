// An update never changes a person's saved views, presets or shortcuts without saying so first (editor spec §74,
// routines_survive_update; ethos rule r_routines). Settings saved by the last release load into this one unchanged.
// One that cannot be kept is named at once, and the old settings are kept as they were saved. No shortcut is lost.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addOwn, readOwnList } from '../packages/core/src/own-presets.ts';
import { ROUTINE_KEYS, routinesLost, routinesLostSaid } from '../packages/core/src/settings-kept.ts';
import { settingsFrom } from '../packages/core/src/settings.ts';
import { STARTERS } from '../packages/core/src/view-presets.ts';
import { build, load, until } from '../packages/obsidian/test/host/load-plugin.js';

const calm = STARTERS.find((p) => p.id === 'calm');
const ownPresets = addOwn(addOwn('', calm, 'Evening'), calm, 'Train');
const [evening] = readOwnList(ownPresets);
// settings as the last release saves them: a preset of the person's own picked, and the drawing set their way
const SAVED = {
  language: 'en-GB',
  strictness: 'standard',
  ownPresets,
  viewPreset: evening.id,
  direction: 'LR',
  focusDepth: 'two',
  labelsByZoom: 'off',
  foldHubs: 'on',
  miniMap: 'off',
  detailsOpen: 'on',
  easierReading: 'on',
};
const SHIPPED = JSON.parse(readFileSync(new URL('./fixtures/shipped-commands.json', import.meta.url), 'utf8')).ids;

describe('routines survive an update (routines_survive_update)', () => {
  before(build);

  test('settings saved by the last release load with every view, preset and drawing setting unchanged', () => {
    const loaded = settingsFrom(SAVED);
    for (const k of Object.keys(SAVED).filter((k) => ROUTINE_KEYS.includes(k)))
      assert.deepEqual(loaded[k], SAVED[k], k);
    assert.deepEqual(routinesLost(SAVED, loaded), []);
    // what this version saves, it reads back the same, so a person who changed nothing is never told of a change
    for (const kept of [loaded, settingsFrom(null)]) assert.deepEqual(routinesLost(kept, settingsFrom(kept)), []);
  });

  test('a routine setting this version cannot keep is named, in words, before anything is saved', () => {
    const saved = { ...SAVED, viewPreset: 'a-preset-since-retired', direction: 'sideways' };
    const lost = routinesLost(saved, settingsFrom(saved));
    assert.deepEqual(lost, ['viewPreset', 'direction']);
    assert.match(routinesLostSaid(lost), /cannot keep your View preset and .+ settings as you saved them/);
    assert.match(routinesLostSaid(lost), /old settings are kept/);
  });

  test('loading the plugin says so at once, keeps the old settings as saved, and writes nothing over them', async () => {
    const saved = { ...SAVED, viewPreset: 'a-preset-since-retired' };
    const env = await load({ data: { settings: saved } });
    try {
      await until(() => env.state.notices.some((n) => /cannot keep your View preset/.test(n)));
      assert.ok(env.state.noticeDurations.includes(0), 'the notice stays until the person closes it');
      await until(() => env.state.data?.settingsBefore);
      assert.deepEqual(env.state.data.settingsBefore, saved);
      assert.deepEqual(env.state.data.settings, saved, 'the saved settings are not written over on load');
    } finally {
      env.uninstall();
    }
  });

  test('settings it can keep load quietly: no notice and nothing kept aside', async () => {
    const env = await load({ data: { settings: SAVED } });
    try {
      assert.ok(!env.state.notices.some((n) => /cannot keep/.test(n)));
      assert.equal(env.state.data?.settingsBefore, undefined);
    } finally {
      env.uninstall();
    }
  });

  test('every command id ever shipped is still offered, so no hotkey a person set is lost', async () => {
    const env = await load({ files: {} });
    try {
      const ids = env.state.commands.map((c) => c.id).sort();
      assert.deepEqual(
        SHIPPED.filter((id) => !ids.includes(id)),
        [],
        'a shipped id was renamed or dropped',
      );
      assert.deepEqual(
        ids.filter((id) => !SHIPPED.includes(id)),
        [],
        'a new command: add its id to test/fixtures/shipped-commands.json',
      );
    } finally {
      env.uninstall();
    }
  });
});
