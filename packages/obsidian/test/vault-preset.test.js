// The vault's own view preset in Obsidian (editor spec ES§69, view_presets_scoped). It is a file at the vault's top.
// A card follows it, a graph's own preset beats it, and the settings page writes and removes it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show, GRAPH } from './host/view-notes.js';

before(() => build());

const PLACE = 'ThoughtKnot view preset.json';
const file = (id) =>
  JSON.stringify({ format: 'thoughtknot-view-preset@1', id, name: id, sentence: '', chain: {}, settings: {} });
const card = (el) => el.querySelector('.thoughtknot-view');
const own = (preset) =>
  `${fence(GRAPH)}\n\n${fence(`// graph: reader_style · STYLE reader\n(p1:Preset {preset: '${preset}'})`)}`;
function page(env) {
  const tab = env.state.settingTabs[0];
  tab.display();
  return tab.containerEl;
}
const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const press = (env, name) => row(page(env), name).querySelector('button').click();

describe('the vault’s preset file', () => {
  // proves: view_presets_scoped
  test('is followed by a card that has no preset of its own, and a graph’s own preset still wins', async () => {
    const env = await load({ files: { [PLACE]: file('calm') }, data: { settings: { ownLayout: 'off' } } });
    try {
      await until(() => !!env.state.files.get(PLACE));
      const plain = await show(env, fence(GRAPH));
      assert.ok(card(plain.el).classList.contains('thoughtknot-still'), 'the vault’s Calm holds the card still');
      const mine = await show(env, own('focus'));
      assert.ok(card(mine.el).classList.contains('thoughtknot-blur-rest'), 'the graph’s own Focus wins');
    } finally {
      env.uninstall();
    }
  });

  // proves: view_presets_scoped
  test('is written and removed on the settings page, which says whose preset is in use', async () => {
    const env = await load({ data: { settings: { viewPreset: 'focus' } } });
    try {
      assert.match(row(page(env), 'View preset in use').textContent, /Focus support, chosen by your settings/);
      assert.ok(!row(page(env), 'Stop using a vault preset'), 'nothing to stop yet');
      press(env, 'Use this preset for the whole vault');
      await until(() => env.state.files.has(PLACE));
      assert.match(env.state.files.get(PLACE), /"id": "focus"/);
      await until(() => /chosen by this vault/.test(row(page(env), 'View preset in use')?.textContent ?? ''));
      press(env, 'Stop using a vault preset');
      await until(() => !env.state.files.has(PLACE));
      await until(() => /chosen by your settings/.test(row(page(env), 'View preset in use')?.textContent ?? ''));
    } finally {
      env.uninstall();
    }
  });

  // proves: view_presets_scoped
  test('is ignored when it is not a preset file, so a card keeps the settings’ choice', async () => {
    const env = await load({
      files: { [PLACE]: '{"format": "something else"}' },
      data: { settings: { ownLayout: 'off' } },
    });
    try {
      const plain = await show(env, fence(GRAPH));
      assert.ok(!card(plain.el).classList.contains('thoughtknot-still'));
      assert.match(row(page(env), 'View preset in use').textContent, /the built-in default/);
    } finally {
      env.uninstall();
    }
  });
});
