// A mix of two view presets (editor spec ES§74, presets_mix). Each part comes from the preset it was taken from, with
// the settings that belong to it. Where two parts clash, the winner's part stays and the clash is said.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN_LINKS, firstOnly, mixPresets } from '../src/preset-mix.ts';
import { starterOf } from '../src/view-presets.ts';
import { addOwn, readOwnList } from '../src/own-presets.ts';

const calm = starterOf('calm'),
  focus = starterOf('focus'),
  detail = starterOf('detail');
const choice = (parts, winner = 'first') => ({ parts: { ...firstOnly().parts, ...parts }, winner });

describe('a mix of two presets (presets_mix)', () => {
  test('calm motion from one and focus support from another: each part, and its settings, from its own', () => {
    const { preset, clashes } = mixPresets(calm, focus, choice({ detail: 'second', keys: 'second' }));
    assert.deepEqual(preset.chain.motion, calm.chain.motion);
    assert.deepEqual(preset.chain.detail, focus.chain.detail);
    assert.deepEqual(preset.chain.keys, focus.chain.keys);
    assert.equal(preset.chain.layout, 'pinned');
    assert.equal(preset.settings.focusDepth, 'two', 'the detail part brings its focus depth');
    assert.equal(preset.settings.direction, 'LR', 'the layout part brings its direction');
    assert.deepEqual(clashes, []);
    assert.match(preset.name, /Calm.*Focus|calm.*focus/i);
  });

  test('a clash is settled by the stated winner, and said', () => {
    // a pinned layout from Calm with Focus's order, which reorders: they clash
    const parts = { ordering: 'second' };
    const calmWins = mixPresets(calm, focus, choice(parts, 'first'));
    assert.equal(calmWins.preset.chain.layout, 'pinned');
    assert.equal(calmWins.preset.chain.ordering, 'fixed');
    assert.equal(calmWins.clashes.length, 1);
    assert.match(calmWins.clashes[0], /^Layout from Calm.* wins, so Order comes from Calm.* too\.$/);
    const focusWins = mixPresets(calm, focus, choice(parts, 'second'));
    assert.equal(focusWins.preset.chain.ordering, 'hubs');
    assert.equal(focusWins.preset.chain.layout, focus.chain.layout);
    assert.match(focusWins.clashes[0], /^Order from Focus.* wins, so Layout comes from Focus.* too\.$/);
  });

  test('a matrix is drawn as a grid, so a matrix with another layout is a clash too', () => {
    const { preset, clashes } = mixPresets(detail, calm, choice({ layout: 'second' }, 'first'));
    assert.equal(preset.chain.projection, 'matrix');
    assert.equal(preset.chain.layout, 'grid');
    assert.equal(clashes.length, 1);
  });

  test('every part is offered, and the mix is kept like any own preset', () => {
    assert.deepEqual(
      [...CHAIN_LINKS],
      ['ordering', 'layout', 'projection', 'detail', 'formatting', 'motion', 'text', 'keys'],
    );
    const { preset } = mixPresets(calm, focus, choice({ detail: 'second' }));
    const [kept] = readOwnList(addOwn('', preset, preset.name));
    assert.ok(kept.id.startsWith('own:'));
    assert.equal(kept.name, preset.name);
    assert.deepEqual(kept.chain, preset.chain);
    assert.deepEqual(kept.settings, preset.settings);
  });
});
