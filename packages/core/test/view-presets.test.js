// View presets by need (editor spec §69): view-presets.ts, and the setting that picks one (settings.ts). A preset
// sets every Drawing setting it turns. It never goes below WCAG 2.2 AA, gives way to the device, and moves between
// hosts as one file.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTERS,
  PRESET_SETTINGS,
  presetChange,
  floored,
  deviceWins,
  presetFor,
  presetFile,
  presetFrom,
  starterOf,
  holdsStill,
  readsPlain,
  shortLabel,
  labelsFor,
  presetClasses,
} from '../src/view-presets.ts';
import { PRESET_IDS } from '../src/style-graph.ts';
import { readStyle } from '../src/style.ts';
import { readNote } from '../src/drawing.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';

describe('the starter presets', () => {
  // proves: view_presets_by_need
  test('are six, named by need and never by diagnosis, each with one plain line', () => {
    assert.deepEqual(
      STARTERS.map((p) => p.name),
      ['Default', 'Focus support', 'Calm and predictable', 'Detail first', 'Big picture first', 'Reading support'],
    );
    for (const p of STARTERS) {
      assert.doesNotMatch(`${p.name} ${p.sentence}`, /adhd|autis|dyslex|disorder|condition/i, p.name);
      assert.ok(p.sentence.length > 0 && p.sentence.split(/[.;]/).filter((x) => x.trim()).length <= 2, p.name);
    }
    const option = OPTIONS.find((o) => o.key === 'viewPreset');
    assert.equal(option.section, 'Drawing');
    assert.deepEqual(
      option.choices.map((c) => c.value),
      STARTERS.map((p) => p.id),
    );
  });

  // proves: view_presets_saved
  test('picking one sets every Drawing setting it turns, each still a setting of its own, kept when saved', () => {
    const change = presetChange('calm');
    assert.equal(change.viewPreset, 'calm');
    for (const k of PRESET_SETTINGS) assert.ok(k in change, `${k} is set`);
    const saved = settingsFrom({ ...DEFAULT_SETTINGS, ...change });
    assert.equal(saved.viewPreset, 'calm');
    assert.equal(saved.labelsByZoom, 'off', 'every label shown');
    assert.equal(saved.direction, 'LR', 'one direction, never flipped');
    const changedAfter = settingsFrom({ ...saved, mergeLinks: 'off' });
    assert.equal(changedAfter.mergeLinks, 'off', 'one choice changed after');
    assert.equal(changedAfter.viewPreset, 'calm');
    assert.equal(settingsFrom({ viewPreset: 'nothing like it' }).viewPreset, 'default');
  });

  test('Calm and predictable lays out again only when asked, and Focus support fades the rest', () => {
    assert.equal(holdsStill({ viewPreset: 'calm' }), true);
    assert.equal(holdsStill({ viewPreset: 'default' }), false, 'the default follows the device');
    assert.equal(starterOf('calm').chain.keys.layoutOnlyAsked, true);
    assert.equal(starterOf('calm').chain.motion.mode, 'off');
    assert.equal(starterOf('focus').chain.detail.rest, 'blurred');
    assert.equal(starterOf('focus').chain.detail.reach, 2);
  });
});

describe('the floor and the device', () => {
  // proves: view_presets_floor
  test('no preset goes below WCAG 2.2 AA contrast and spacing, and colour is never alone', () => {
    for (const p of STARTERS) assert.deepEqual(floored(p.chain), p.chain, `${p.name} is already on the floor`);
    const low = floored({
      ...starterOf('default').chain,
      formatting: { contrast: 'none', palette: 'muted', nonColourCue: false },
      text: { wordSpacing: 0, lineHeight: 1, mostLabel: 2 },
    });
    assert.equal(low.formatting.contrast, 'AA');
    assert.equal(low.formatting.nonColourCue, true);
    assert.ok(low.text.wordSpacing >= 0.16 && low.text.lineHeight >= 1.5);
  });

  // proves: view_presets_os_wins
  test('the device’s reduced motion and more contrast win, each with a line saying so', () => {
    const { chain, lines } = deviceWins(starterOf('default').chain, { reducedMotion: true, moreContrast: true });
    assert.deepEqual(chain.motion, { mode: 'off', glideMs: 0 });
    assert.equal(chain.formatting.contrast, 'AAA');
    assert.equal(lines.length, 2);
    assert.deepEqual(deviceWins(starterOf('calm').chain, {}).lines, [], 'nothing asked, nothing said');
  });
});

describe('where a preset applies, and moving it', () => {
  // proves: view_presets_scoped
  test('the nearest wins: a graph’s own, then the vault’s, then the one for everything', () => {
    assert.equal(presetFor({ graph: 'detail', vault: 'calm', everywhere: 'focus' }).id, 'detail');
    assert.equal(presetFor({ vault: 'calm', everywhere: 'focus' }).id, 'calm');
    assert.equal(presetFor({ everywhere: 'focus' }).id, 'focus');
    assert.equal(presetFor({}).id, 'default');
  });

  // proves: view_presets_scoped
  test('a graph’s own preset is a Preset line in its style graph, one of the starters, checked like any other', () => {
    assert.deepEqual(
      [...PRESET_IDS],
      STARTERS.map((p) => p.id),
      'the style graph knows every starter',
    );
    const texts = [
      "// graph: work\n(a:Task {name: 'A'})",
      "// graph: work_style · STYLE work\n(p1:Preset {preset: 'calm'}),\n(p2:Preset {preset: 'clam'}),\n(p3:Preset {})",
    ];
    const { style, problems } = readStyle(texts, 'work', readNote(texts));
    assert.deepEqual(
      style.presets.map((p) => p.preset),
      ['calm'],
    );
    assert.deepEqual(
      problems.map((p) => p.message),
      ['preset must be default, focus, calm, detail, big-picture or reading', 'a Preset names a view preset'],
    );
    assert.equal(presetFor({ graph: style.presets[0].preset, everywhere: 'focus' }).id, 'calm');
    // and its card takes what the preset asks of it, as the page's body does for the settings' preset
    assert.deepEqual(presetClasses('calm'), ['thoughtknot-still']);
    assert.deepEqual(presetClasses('reading'), ['thoughtknot-reading']);
    assert.deepEqual(presetClasses('focus'), ['thoughtknot-blur-rest', 'thoughtknot-still']);
    assert.deepEqual(presetClasses('default'), []);
  });

  // proves: view_presets_portable
  test('a preset goes out as one file and comes back the same; a file read is untrusted', () => {
    for (const p of STARTERS) assert.deepEqual(presetFrom(presetFile(p)), p, p.name);
    assert.ok('problems' in presetFrom('not json'));
    assert.ok('problems' in presetFrom('{"format": "something else"}'));
    const odd = presetFrom(
      JSON.stringify({
        format: 'thoughtknot-view-preset@1',
        name: 'Mine\nwith a break',
        chain: { formatting: { contrast: 'none' }, motion: { glideMs: 99999 } },
        settings: { foldHubs: 'on', aiUse: 'on', exportFolder: '/' },
      }),
    );
    assert.equal(odd.name, 'Mine with a break');
    assert.equal(odd.chain.formatting.contrast, 'AA', 'raised to the floor');
    assert.ok(odd.chain.motion.glideMs <= 500);
    assert.deepEqual(odd.settings, { foldHubs: 'on' }, 'only the settings a preset may turn');
  });
});

describe('the research behind the starters', () => {
  // proves: view_presets_evidence
  test('each starter cites its research with how sure it is, on the wiki, with the day it was last looked at', async () => {
    const { readFile } = await import('node:fs/promises');
    const page = await readFile(new URL('../../../wiki/View-presets-design.md', import.meta.url), 'utf8');
    const part = page.slice(page.indexOf('## Why each starter'), page.indexOf('## What the research says'));
    assert.match(part, /\*\*Looked at again:\*\* \d{1,2} [A-Z][a-z]+\s+\d{4}/, 'when it was last looked at');
    const rows = part
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| ---') && !l.startsWith('| Starter'))
      .map((l) =>
        l
          .split('|')
          .map((c) => c.trim())
          .slice(1, -1),
      );
    for (const p of STARTERS) {
      const mine = rows.filter((r) => r[0] === p.name);
      assert.ok(mine.length, `${p.name} has its reasons`);
      for (const [, choice, why, sure, source] of mine) {
        assert.ok(choice && why, `${p.name}: a choice and why`);
        assert.ok(['High', 'Medium', 'Low'].includes(sure), `${p.name}: how sure, not "${sure}"`);
        assert.match(source, /\d{4}|WCAG|Association/, `${p.name}: a source`);
      }
    }
  });
});

describe('reading support', () => {
  // proves: view_reading_support
  test('only the Reading preset spaces words wider, and cuts long labels short at a word, marked as cut', () => {
    assert.deepEqual(
      STARTERS.filter((p) => readsPlain({ viewPreset: p.id })).map((p) => p.id),
      ['reading'],
    );
    assert.equal(shortLabel('Short', 40), 'Short');
    const cut = shortLabel('The quarterly report on the reading habits of every reader', 40);
    assert.equal(cut, 'The quarterly report on the reading…');
    assert.ok(cut.length <= 40);
    assert.equal(shortLabel('Supercalifragilisticexpialidocious', 12), 'Supercalifr…', 'cut inside a long word');
    const d = {
      graph: 'g',
      boxes: [
        { key: 'a', kind: 'Report', text: 'x'.repeat(50) },
        { key: 'b', kind: 'Team', text: 'Team' },
      ],
      links: [],
      estimates: [],
    };
    assert.equal(labelsFor(d, { viewPreset: 'default' }), d, 'the default keeps every word');
    const read = labelsFor(d, { viewPreset: 'reading' });
    assert.equal(read.boxes[0].text.length, 40);
    assert.equal(read.boxes[1], d.boxes[1]);
    assert.equal(d.boxes[0].text.length, 50, 'the graph itself is unchanged');
  });
});
