// Clouds round the groups of a level (editor spec §68, level_clouds): level-clouds.ts. A cloud fits its things, with
// room to spare, and moves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudPath, cloudsAt } from '../src/level-clouds.ts';

/** The points a path passes through or bends towards, as [x, y]. */
const pointsOf = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)].map((m) => m[0].split(',').map(Number));

// proves: level_clouds
test('a cloud is one closed soft outline round its things, with room to spare', () => {
  const rects = [
    { left: 0, top: 0, right: 40, bottom: 20 },
    { left: 100, top: 60, right: 140, bottom: 80 },
  ];
  const d = cloudPath(rects, 10);
  assert.match(d, /^M.* Z$/);
  assert.ok(d.includes('Q'), 'its corners are curves');
  const pts = pointsOf(d);
  assert.ok(Math.min(...pts.map((p) => p[0])) <= -10 + 1e-9);
  assert.ok(Math.max(...pts.map((p) => p[0])) >= 150 - 1e-9);
  assert.ok(Math.max(...pts.map((p) => p[1])) >= 90 - 1e-9);
  assert.equal(cloudPath([], 10), '');
});

// proves: level_clouds
test('each group of the level shown gets a cloud with its name and count; the last level gets none', () => {
  const levels = [
    {
      name: 'Subjects',
      groups: [
        { key: '0:0', name: 'Work', things: ['a', 'b'] },
        { key: '0:1', name: 'Money', things: ['c'] },
        { key: '0:2', name: 'Gone', things: ['z'] },
      ],
    },
    { name: 'Every item', groups: [] },
  ];
  const rectOf = new Map([
    ['a', { left: 0, top: 0, right: 10, bottom: 10 }],
    ['b', { left: 20, top: 0, right: 30, bottom: 10 }],
    ['c', { left: 100, top: 50, right: 110, bottom: 60 }],
  ]);
  const clouds = cloudsAt(levels, 0, rectOf, 5);
  assert.deepEqual(
    clouds.map((c) => [c.name, c.count, c.x, c.y, c.index]),
    [
      ['Work', 2, 15, -5, 0],
      ['Money', 1, 105, 45, 1],
    ],
  );
  assert.deepEqual(cloudsAt(levels, 1, rectOf, 5), []);
});
