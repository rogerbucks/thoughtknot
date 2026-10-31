// The six shapes an exploration is drawn in (editor spec §71): layouts/explore-shapes.ts.
// Requirements: explore_shapes and explore_stays_put.
// - Every shape places every shown thing, in 2D, 2.5D and 3D, the centre at the middle, the same way every time.
// - The balanced map has branches on both sides; the trees run one way; rings and the disc go out by steps.
// - Given last time's spots, nothing shown moves, and a new branch lands beside the thing it opened from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExploreMap } from '../src/explore-map.ts';
import { EXPLORE_SHAPES, exploreSpots } from '../src/layouts/explore-shapes.ts';

const box = (key) => ({ key, kind: 'Thing', text: key });
const link = (from, to) => ({ from, to, type: 'Thing', reading: 'links' });

/** An idea with four branches, two of them with three leaves each, and a cross-link between two leaves. */
const KEYS = ['idea', 'a', 'b', 'c', 'd', 'a1', 'a2', 'a3', 'c1', 'c2', 'c3'];
const MIND = {
  graph: 'G',
  boxes: KEYS.map(box),
  links: [
    ...['a', 'b', 'c', 'd'].map((k) => link('idea', k)),
    ...['a1', 'a2', 'a3'].map((k) => link('a', k)),
    ...['c1', 'c2', 'c3'].map((k) => link('c', k)),
    link('a3', 'c1'),
  ],
  estimates: [],
};

const explored = () => {
  const m = new ExploreMap(MIND, 'idea');
  m.toDepth(2);
  return m;
};

const far = (s) => Math.hypot(...s);

test('every shape places every shown thing in 2D, 2.5D and 3D, the centre at the middle', () => {
  const m = explored();
  for (const shape of EXPLORE_SHAPES)
    for (const [space, dims] of [
      ['2d', 2],
      ['2.5d', 3],
      ['3d', 3],
    ]) {
      const spots = exploreSpots(m, shape, space, { crossLinks: m.crossLinks() });
      assert.deepEqual([...spots.keys()].sort(), [...KEYS].sort(), `${shape} ${space}`);
      for (const [k, s] of spots) {
        assert.equal(s.length, dims, `${shape} ${space} ${k}`);
        assert.ok(
          s.every((v) => Number.isFinite(v)),
          `${shape} ${space} ${k}`,
        );
      }
      assert.ok(far(spots.get('idea')) < 1e-6, `${shape} ${space}: the centre sits at the middle`);
      assert.deepEqual(exploreSpots(m, shape, space, { crossLinks: m.crossLinks() }), spots, 'the same every time');
    }
});

test('the balanced map puts branches on both sides of the centre, and the trees run one way', () => {
  const m = explored();
  const balanced = exploreSpots(m, 'balanced', '2d');
  const sides = ['a', 'b', 'c', 'd'].map((k) => Math.sign(balanced.get(k)[0]));
  assert.ok(sides.includes(1) && sides.includes(-1), `sides ${sides}`);
  assert.equal(Math.sign(balanced.get('a1')[0]), Math.sign(balanced.get('a')[0]), 'a branch keeps to its side');
  const right = exploreSpots(m, 'one-sided', '2d');
  assert.ok(
    KEYS.filter((k) => k !== 'idea').every((k) => right.get(k)[0] > 0),
    'one-sided grows right',
  );
  const down = exploreSpots(m, 'top-down', '2d');
  assert.ok(
    KEYS.filter((k) => k !== 'idea').every((k) => down.get(k)[1] > 0),
    'top-down grows down',
  );
});

test('rings and the disc go out a step at a time, and the disc never reaches past its edge', () => {
  const m = explored();
  for (const shape of ['rings', 'disc']) {
    const spots = exploreSpots(m, shape, '2d');
    assert.ok(far(spots.get('a1')) > far(spots.get('a')) + 1, `${shape}: a second step sits further out`);
    assert.ok(Math.abs(far(spots.get('a')) - far(spots.get('b'))) < 1e-6, `${shape}: one step out is one ring`);
  }
  const disc = exploreSpots(m, 'disc', '2d');
  assert.ok([...disc.values()].every((s) => far(s) < 520));
});

test('in 2.5D each step out sits one plane further back; in 3D branches spread through space', () => {
  const m = explored();
  const planes = exploreSpots(m, 'balanced', '2.5d');
  assert.ok(planes.get('a')[2] < 0 && planes.get('a1')[2] < planes.get('a')[2]);
  const space = exploreSpots(m, 'balanced', '3d');
  const depths = new Set(['a', 'b', 'c', 'd'].map((k) => Math.round(space.get(k)[2])));
  assert.ok(depths.size > 1, 'the branches do not all lie on one plane');
});

test('given last time’s spots, nothing shown moves, and a new branch lands beside its parent', () => {
  const m = new ExploreMap(MIND, 'idea');
  m.open('idea');
  for (const shape of EXPLORE_SHAPES)
    for (const space of ['2d', '2.5d', '3d']) {
      const before = exploreSpots(m, shape, space);
      const after = new ExploreMap(MIND, 'idea');
      after.open('idea');
      after.open('a');
      const spots = exploreSpots(after, shape, space, { previous: before });
      for (const [k, s] of before) assert.deepEqual(spots.get(k), s, `${shape} ${space}: ${k} stays put`);
      // the free shape starts from last time's spots, so its fresh offsets differ a little: it only lands near
      if (shape === 'free') {
        assert.ok(far(spots.get('a2').map((v, i) => v - spots.get('a')[i])) < 400, `${shape} ${space}: a2 near a`);
        continue;
      }
      const fresh = exploreSpots(after, shape, space);
      const offset = (map, k) => map.get(k).map((v, i) => v - map.get('a')[i]);
      assert.deepEqual(
        offset(spots, 'a2').map((v) => Math.round(v)),
        offset(fresh, 'a2').map((v) => Math.round(v)),
        `${shape} ${space}: a2 lands where it would sit beside a`,
      );
    }
});

test('a lone centre is placed alone at the middle', () => {
  const m = new ExploreMap(MIND, 'idea');
  for (const shape of EXPLORE_SHAPES) {
    assert.deepEqual([...exploreSpots(m, shape, '2d')], [['idea', [0, 0]]], shape);
    assert.deepEqual([...exploreSpots(m, shape, '3d').keys()], ['idea'], shape);
  }
});
