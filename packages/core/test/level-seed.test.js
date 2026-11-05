import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelSeed } from '../src/layouts/level-seed.ts';
import { detailLevels } from '../src/detail-levels.ts';
import { stressLayout } from '../src/layouts/stress.ts';
import { pickLayout } from '../src/layouts/pick.ts';

/** `groups` clumps of `size` things, each clump a ring with a spoke, and one link between neighbouring clumps. */
function clumped(groups, size) {
  const things = [],
    links = [];
  for (let g = 0; g < groups; g++)
    for (let i = 0; i < size; i++) {
      things.push({ key: `g${g}t${i}`, text: `g${g}t${i}` });
      links.push({ from: `g${g}t${i}`, to: `g${g}t${(i + 1) % size}` });
      if (i > 1) links.push({ from: `g${g}t0`, to: `g${g}t${i}` });
    }
  for (let g = 1; g < groups; g++) links.push({ from: `g${g - 1}t0`, to: `g${g}t0` });
  return { things, links };
}

const mid = (spots, keys) => {
  const ps = keys.map((k) => spots.get(k));
  return [ps.reduce((t, p) => t + p[0], 0) / ps.length, ps.reduce((t, p) => t + p[1], 0) / ps.length];
};
const spread = (spots, keys) => {
  const [x, y] = mid(spots, keys);
  return Math.max(...keys.map((k) => Math.hypot(spots.get(k)[0] - x, spots.get(k)[1] - y)));
};

// proves: level_layout
test('a small graph gets no seed: its layout is as it was', () => {
  assert.equal(levelSeed(clumped(3, 6), 2, 50), null);
});

// proves: level_layout
test('groups are placed first, and each topic sits together in its own room, apart from the others', () => {
  const shape = clumped(8, 10);
  const seed = levelSeed(shape, 2, 50);
  assert.ok(seed);
  assert.equal(seed.size, shape.things.length, 'every thing gets a spot');
  const levels = detailLevels(shape);
  const topics = levels[levels.length - 2].groups;
  // each topic's things are nearer their own middle than the topic is to the nearest other topic
  for (const a of topics) {
    const [ax, ay] = mid(seed, a.things);
    const nearest = Math.min(
      ...topics.filter((b) => b !== a).map((b) => Math.hypot(...mid(seed, b.things).map((v, i) => v - [ax, ay][i]))),
    );
    assert.ok(spread(seed, a.things) < nearest, `topic ${a.name} sits apart`);
  }
});

// proves: level_layout
test('the same graph gives the same seed, and stress started from it keeps the topics together', () => {
  const shape = clumped(8, 10);
  assert.deepEqual([...levelSeed(shape, 2, 50)], [...levelSeed(shape, 2, 50)]);
  const spots = stressLayout(shape, 2, levelSeed(shape, 2, 50), { unit: 50 });
  const levels = detailLevels(shape);
  for (const t of levels[levels.length - 2].groups) assert.ok(spread(spots, t.things) < 50 * 6, `${t.name} together`);
});

// proves: level_layout
test('in space the seed has three numbers per thing, the groups spread in depth too', () => {
  const seed = levelSeed(clumped(8, 10), 3, 50);
  assert.ok([...seed.values()].every((p) => p.length === 3));
  assert.ok(new Set([...seed.values()].map((p) => Math.round(p[2]))).size > 1);
});

// proves: level_default
test('a big graph is laid out by its levels, whatever its shape, so each cloud is its own room', () => {
  const big = clumped(30, 8);
  assert.equal(pickLayout(big).why, 'levels', 'a big network');
  // every link one way: a flow of one kind, as a vault's notes
  const flow = {
    things: big.things.map((t) => ({ ...t, kinds: ['Note'] })),
    links: big.links.map((l) => (l.from < l.to ? l : { from: l.to, to: l.from })),
  };
  assert.equal(pickLayout(flow).why, 'levels', 'a big flow of one kind');
  const kinds = ['Section', 'Requirement', 'Decision'];
  const laned = { ...flow, things: flow.things.map((t, i) => ({ ...t, kinds: [kinds[i % 3]] })) };
  assert.equal(
    pickLayout(laned).why,
    'levels',
    'a big flow of three kinds too (Roger, 5 Nov 2026: not one thin column)',
  );
  assert.notEqual(pickLayout(clumped(10, 8)).why, 'levels', 'a graph of 80 things is laid out as before');
});
