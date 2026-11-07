// Subject colours and the spotlight (editor spec §68, level_colours): level-colours.ts and level-legend.ts. Each subject
// takes a hue, its areas and topics shades of it; pointing at a subject spotlights it, and the rest fade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUES, hueOf, nextHue, subjectOf } from '../src/display/graph-view/level-colours.ts';

const levels = [
  {
    name: 'Subjects',
    groups: [
      { key: '0:0', name: 'Work', things: ['a', 'b', 'c'] },
      { key: '0:1', name: 'Money', things: ['d'] },
    ],
  },
  {
    name: 'Areas',
    groups: [
      { key: '1:0', name: 'Jobs', things: ['a', 'b'], parent: '0:0' },
      { key: '1:1', name: 'Pay', things: ['c'], parent: '0:0' },
      { key: '1:2', name: 'Bank', things: ['d'], parent: '0:1' },
    ],
  },
  { name: 'Every item', groups: [] },
];

// proves: level_colours
test('each subject takes a hue in turn, its areas take its hue, and a picked colour stays its own', () => {
  assert.equal(hueOf(levels, '0:0'), 0);
  assert.equal(hueOf(levels, '0:1'), 1);
  assert.equal(subjectOf(levels, 1, '1:1'), '0:0');
  assert.equal(subjectOf(levels, 1, '1:2'), '0:1');
  assert.equal(subjectOf(levels, 0, '0:1'), '0:1');
  assert.equal(nextHue(levels, '0:1'), 2);
  assert.equal(hueOf(levels, '0:1'), 2, 'picked');
  for (let i = 0; i < HUES; i++) nextHue(levels, '0:1');
  assert.equal(hueOf(levels, '0:1'), 2, 'round the hues and back');
});

// proves: level_colours
test('the legend spotlights a subject while pointed at, keeps it on a click, and recolours its clouds', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { make } = await import('../src/display/graph-view/note-callouts.ts');
    const { LevelLegend } = await import('../src/display/graph-view/level-legend.ts');
    const { SPOTLIT, SPOT, ownHue } = await import('../src/display/graph-view/level-colours.ts');
    const svg = make('svg', {});
    for (const k of ['a', 'b', 'c', 'd']) svg.appendChild(make('g', { class: 'node', 'data-key': k }));
    const fresh = structuredClone(levels);
    const parent = doc.createElement('div'),
      viewport = doc.createElement('div');
    let redrawn = 0;
    const legend = new LevelLegend(parent, {
      viewport,
      svg: () => svg,
      redraw: () => redrawn++,
      drawing: () => undefined,
      // the new rendering paints its own colours, and the chips show them (Roger, 7 Nov 2026)
      colourOf: (key) => (key === '0:0' ? ['#4b7bf5', '#f2793a'][ownHue(fresh, key) ?? 0] : undefined),
    });
    legend.show(fresh);
    const swatch = () => parent.querySelector('.thoughtknot-level-swatch');
    assert.equal(swatch().cssProps['--thoughtknot-swatch'], '#4b7bf5', 'the chip shows the colour the drawing paints');
    assert.equal(legend.shown(), fresh);
    const chips = parent.querySelectorAll('.thoughtknot-level-chip');
    assert.deepEqual(
      chips.map((c) => c.textContent),
      ['Work', 'Money'],
    );
    chips[1].dispatch('pointerenter', {});
    assert.ok(svg.classList.contains(SPOTLIT));
    const spot = () => svg.children.filter((g) => g.classList.contains(SPOT)).map((g) => g.getAttribute('data-key'));
    assert.deepEqual(spot(), ['d'], 'Money in the spotlight, the rest fade');
    chips[1].dispatch('pointerleave', {});
    assert.ok(!svg.classList.contains(SPOTLIT), 'gone when the pointer leaves');
    chips[0].dispatch('click', {});
    chips[0].dispatch('pointerleave', {});
    assert.deepEqual(spot(), ['a', 'b', 'c'], 'kept by a click');
    assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
    parent.querySelectorAll('.thoughtknot-level-colour')[0].dispatch('click', {});
    assert.equal(hueOf(fresh, '0:0'), 1, 'the next colour');
    assert.equal(redrawn, 1, 'its clouds drawn again in it');
    assert.equal(swatch().cssProps['--thoughtknot-swatch'], '#f2793a', 'and the chip takes the new one');
    legend.show(null);
    assert.ok(parent.querySelector('.thoughtknot-level-legend').hasClass('is-hidden'), 'none for one level');
  } finally {
    uninstall();
  }
});

// proves: level_thing_hue
test('near in, each thing takes its subject’s colour, but a thing a rule colours keeps its own', async () => {
  // Roger, 4 Nov 2026: items keep their subject's colour when you zoom in, in 2D, 3D and on the globe
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const uninstall = installGlobals(fakeDocument(800));
  try {
    const { make } = await import('../src/display/graph-view/note-callouts.ts');
    const { tintThings } = await import('../src/display/graph-view/level-colours.ts');
    const fresh = structuredClone(levels);
    const svg = make('svg', {});
    for (const k of ['a', 'b', 'd', 'z']) svg.appendChild(make('g', { class: 'node', 'data-key': k }));
    svg.children[1].classList.add('thoughtknot-look');
    tintThings(svg, fresh);
    const hues = () => svg.children.map((g) => g.getAttribute('data-hue'));
    assert.deepEqual(hues(), ['0', null, '1', null], 'by subject; a rule’s look and a thing in no subject keep theirs');
    nextHue(fresh, '0:0');
    tintThings(svg, fresh);
    assert.equal(svg.children[0].getAttribute('data-hue'), '1', 'a picked colour reaches its things');
    tintThings(svg, null);
    assert.deepEqual(hues(), [null, null, null, null], 'one level: the drawing’s own colours');
  } finally {
    uninstall();
  }
});
