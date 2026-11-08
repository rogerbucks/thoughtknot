// A person's own view presets, kept as a list (view_presets_own_list).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addOwn, deleteOwn, readOwnList, renameOwn, MOST_OWN } from '../src/own-presets.ts';
import { PresetPanel } from '../src/preset-panel.ts';
import { DEFAULT_SETTINGS, settingsFrom } from '../src/settings.ts';
import { STARTERS, presetFile, starterOf } from '../src/view-presets.ts';
import { word } from '../src/words.ts';
import { presetHolds } from '../src/view-preset-preview.ts';

const calm = STARTERS.find((p) => p.id === 'calm');
const names = (text) => readOwnList(text).map((p) => p.name);

describe('own presets', () => {
  test('start as an empty list', () => {
    assert.deepEqual(readOwnList(''), []);
    assert.deepEqual(readOwnList('not json'), []);
  });

  test('keep any number of presets, each with the name chosen', () => {
    let text = addOwn('', calm, 'Evening');
    text = addOwn(text, calm, 'Morning');
    assert.deepEqual(names(text), ['Evening', 'Morning']);
    const ids = readOwnList(text).map((p) => p.id);
    assert.equal(new Set(ids).size, 2);
    assert.ok(ids.every((id) => id.startsWith('own:')));
  });

  test('rename and delete one without touching the rest', () => {
    let text = addOwn(addOwn('', calm, 'A'), calm, 'B');
    const [a, b] = readOwnList(text);
    text = renameOwn(text, a.id, 'Alpha');
    assert.deepEqual(names(text), ['Alpha', 'B']);
    text = deleteOwn(text, b.id);
    assert.deepEqual(names(text), ['Alpha']);
    assert.deepEqual(names(deleteOwn(text, 'own:nothing')), ['Alpha']);
  });

  test('an empty name is refused and a long one is cut', () => {
    const text = addOwn('', calm, '   ');
    assert.equal(names(text)[0], calm.name);
    assert.ok(names(addOwn('', calm, 'x'.repeat(200)))[0].length <= 60);
  });

  test('are read as untrusted and never go below the floor', () => {
    const evil = JSON.stringify({
      format: 'thoughtknot-own-presets@1',
      items: [
        {
          format: 'thoughtknot-view-preset@1',
          id: 'x',
          name: 'Bad',
          chain: { text: { wordSpacing: 0 }, formatting: { contrast: 'x' } },
          settings: { evil: 'yes' },
        },
        'junk',
        null,
      ],
    });
    const [p, ...rest] = readOwnList(evil);
    assert.equal(rest.length, 0);
    assert.ok(p.chain.text.wordSpacing >= 0.16);
    assert.equal(p.chain.formatting.contrast, 'AA');
    assert.equal('evil' in p.settings, false);
  });

  test('stop at the most a person may keep', () => {
    let text = '';
    for (let i = 0; i < MOST_OWN + 5; i++) text = addOwn(text, calm, `P${i}`);
    assert.equal(readOwnList(text).length, MOST_OWN);
  });
});

describe('own presets in the settings and the panel', () => {
  const made = (names) => names.reduce((text, n) => addOwn(text, calm, n), '');
  const panelOver = (start = {}) => {
    const state = { s: { ...DEFAULT_SETTINGS, ...start } };
    const p = new PresetPanel({
      settings: () => state.s,
      save: async (next) => void (state.s = settingsFrom(next)),
      update: () => {},
      share: async () => {},
      vault: () => undefined,
      setVault: async () => {},
    });
    return { p, state };
  };
  const done = async (ready) => {
    for (let i = 0; i < 200 && !ready(); i++) await Promise.resolve();
    assert.ok(ready(), 'the panel finished');
  };

  test('are kept by the settings, and one picked is used only while it is in the list', () => {
    const text = made(['Evening']);
    const [mine] = readOwnList(text);
    const kept = settingsFrom({ ownPresets: text, viewPreset: mine.id });
    assert.equal(kept.viewPreset, mine.id);
    assert.equal(starterOf(mine.id).name, 'Evening');
    const gone = settingsFrom({ ownPresets: '', viewPreset: mine.id });
    assert.equal(gone.viewPreset, 'default');
  });

  test('show beside the starters, and picking one shows what it would change', () => {
    const text = made(['A', 'B']);
    const { p } = panelOver({ ownPresets: text });
    assert.deepEqual(
      p.choices().map((c) => c.name),
      [...STARTERS.map((s) => s.name), 'A', 'B'],
    );
    const [a] = readOwnList(text);
    p.pick(a.id);
    assert.equal(p.shown(), a.id);
  });

  test('are saved from the settings in use in one step, and renamed and deleted by the panel', async () => {
    const { p, state } = panelOver({ labelsByZoom: 'on' });
    p.ownRows()
      .find((r) => r.name === 'Save the drawing settings as a preset of your own')
      .action();
    await done(() => readOwnList(state.s.ownPresets).length === 1);
    const [mine] = readOwnList(state.s.ownPresets);
    assert.equal(mine.settings.labelsByZoom, 'on', 'it holds the settings in use');
    p.renameOwn(mine.id, 'Reading at night');
    await done(() => readOwnList(state.s.ownPresets)[0]?.name === 'Reading at night');
    p.deleteOwn(mine.id);
    await done(() => readOwnList(state.s.ownPresets).length === 0);
  });

  test('say which own preset is shown, so the panel can ask for its name (view_presets_own_everywhere)', () => {
    const text = made(['A', 'B']);
    const [, b] = readOwnList(text);
    const { p } = panelOver({ ownPresets: text });
    assert.equal(p.shownOwn(), undefined, 'a starter has no name to change');
    p.pick(b.id);
    assert.deepEqual(p.shownOwn(), { id: b.id, name: 'B' });
    p.pick('default');
    assert.equal(p.shownOwn(), undefined);
  });

  test('one in use that is deleted falls back to the default', async () => {
    const text = made(['A']);
    const [a] = readOwnList(text);
    const { p, state } = panelOver({ ownPresets: text, viewPreset: a.id });
    p.deleteOwn(a.id);
    await done(
      () => state.s.ownPresets === settingsFrom({}).ownPresets || readOwnList(state.s.ownPresets).length === 0,
    );
    assert.equal(state.s.viewPreset, 'default');
  });

  test('take a preset file brought in into the list, instead of refusing it', async () => {
    const { p, state } = panelOver();
    const file = presetFile({ ...calm, id: 'travel', name: 'Travel' });
    assert.equal(await p.bringIn(file), undefined);
    assert.deepEqual(
      readOwnList(state.s.ownPresets).map((c) => c.name),
      ['Travel'],
    );
    assert.ok(p.choices().some((c) => c.name === 'Travel'));
  });

  test('say why a file brought in is not a preset, and keep the list as it was', async () => {
    const text = made(['Evening']);
    const { p, state } = panelOver({ ownPresets: text });
    assert.match(await p.bringIn('not json'), /./);
    assert.equal(state.s.ownPresets, text);
  });

  test('offer the text pasted as Your own to be added to the list', async () => {
    const { p, state } = panelOver({ ownPreset: presetFile({ ...calm, id: 'pasted', name: 'Pasted' }) });
    const row = p.ownRows().find((r) => r.name === word('settings.own-presets.bring'));
    row.action();
    await done(() => readOwnList(state.s.ownPresets).length === 1 && state.s.ownPreset === '');
  });

  test('say what a preset would hold before it is kept (view_presets_own_save)', () => {
    const { p } = panelOver({ miniMap: false });
    const row = p.ownRows().find((r) => r.name === word('settings.own-presets.save'));
    assert.match(row.desc, /Keeps the Drawing settings/);
    for (const line of presetHolds(DEFAULT_SETTINGS)) assert.ok(row.desc.includes(line.name), line.name);
    assert.equal(presetHolds(DEFAULT_SETTINGS).length, 8);
  });
});
