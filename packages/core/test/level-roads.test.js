// Roads between clouds (editor spec §68, level_roads): level-roads.ts. Links between groups merge into a road per pair,
// one lane each way, round other clouds, with a gate at each end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portOf, roadsAt } from '../src/level-roads.ts';

const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const cloud = (key, name, b, index) => ({ key, name, count: 1, path: '', x: 0, y: 0, index, box: b });
const levels = [
  {
    name: 'Subjects',
    groups: [
      { key: 'W', name: 'Work', things: ['a', 'b'] },
      { key: 'M', name: 'Money', things: ['c', 'd'] },
      { key: 'H', name: 'Home', things: ['e'] },
    ],
  },
  { name: 'Every item', groups: [] },
];

// proves: level_roads
test('a port is where the line between two middles leaves a cloud', () => {
  assert.deepEqual(portOf(box(0, 0, 100, 50), [300, 25]), [100, 25]);
  assert.deepEqual(portOf(box(0, 0, 100, 50), [50, -200]), [50, 0]);
});

// proves: level_roads
test('links between two groups merge into one road, a lane each way, every link counted, gates saying where', () => {
  const clouds = [cloud('W', 'Work', box(0, 0, 100, 100), 0), cloud('M', 'Money', box(300, 0, 400, 100), 1)];
  const links = [
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'c', to: 'a' },
    { from: 'a', to: 'b' }, // inside one group: no road
  ];
  const roads = roadsAt(levels, 0, links, clouds, 6, 20);
  assert.equal(roads.length, 1);
  const [road] = roads;
  assert.equal(road.count, 3);
  assert.deepEqual(
    road.lanes.map((l) => [l.from, l.to, l.count]),
    [
      ['M', 'W', 1],
      ['W', 'M', 2],
    ],
  );
  assert.notEqual(road.lanes[0].d, road.lanes[1].d, 'two lanes side by side');
  assert.match(road.lanes[1].d, /^M100,-?\d/, 'starts at the port on the edge of its cloud');
  assert.deepEqual(road.gates.map((g) => g.text).sort(), ['⇄ Money · 3', '⇄ Work · 3']);
});

// proves: level_arrows
test("a gate's arrow says which way its links go: out, in, or both", () => {
  const clouds = [cloud('W', 'Work', box(0, 0, 100, 100), 0), cloud('M', 'Money', box(300, 0, 400, 100), 1)];
  const [road] = roadsAt(levels, 0, [{ from: 'a', to: 'c' }], clouds, 6, 20);
  // the gate at Work points out to Money; the one at Money points in from Work
  assert.deepEqual(road.gates.map((g) => g.text).sort(), ['← Work · 1', '→ Money · 1']);
});

// proves: level_roads
test('a road one way only has one lane on the line; a road that would cross another cloud bends round it', () => {
  const clouds = [
    cloud('W', 'Work', box(0, 0, 100, 100), 0),
    cloud('H', 'Home', box(180, 20, 220, 80), 1),
    cloud('M', 'Money', box(300, 0, 400, 100), 2),
  ];
  const [road] = roadsAt(levels, 0, [{ from: 'a', to: 'c' }], clouds, 6, 20);
  assert.equal(road.lanes.length, 1);
  assert.match(road.lanes[0].d, /^M100,50 Q/, 'a curve round Home');
  const control = road.lanes[0].d.split(' ')[1].slice(1).split(',').map(Number);
  assert.ok(control[1] < 20 || control[1] > 80, 'its bend is pushed out past Home');
});
