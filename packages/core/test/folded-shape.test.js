// The View menu's folds in a view drawn as marks (editor spec §68, view_options_everywhere): folded-shape.ts. A hub
// folded, a group folded into one box and links merged reach a chord or a hive as they reach a network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldedShape } from '../src/folded-shape.ts';
import { foldPlan } from '../src/untangle-fold.ts';

const thing = (key) => ({ key, text: key.toUpperCase(), kinds: [] });
const SHAPE = {
  things: ['a', 'b', 'c', 'd'].map(thing),
  links: [
    { from: 'a', type: 'R', to: 'b' },
    { from: 'a', type: 'R', to: 'c' },
    { from: 'b', type: 'R', to: 'c' },
    { from: 'c', type: 'S', to: 'd' },
  ],
  groups: [['Team', ['b', 'c']]],
};
const KEYS = SHAPE.things.map((t) => t.key);

// proves: view_options_everywhere
test('a folded group is one thing, named with its count, and the links to its things run to it', () => {
  const plan = foldPlan(KEYS, SHAPE.links, [['Team', ['b', 'c']]], { hubs: false, groups: true, merge: false });
  const shape = foldedShape(SHAPE, plan);
  assert.deepEqual(
    shape.things.map((t) => [t.key, t.text]),
    [
      ['a', 'A'],
      ['d', 'D'],
      ['group: 1', 'Team (2 things)'],
    ],
  );
  assert.deepEqual(
    shape.links.map((l) => `${l.from}>${l.to}`),
    ['a>group: 1', 'a>group: 1', 'group: 1>d'],
    'the link inside the group is folded away',
  );
  assert.equal(shape.groups, undefined, 'a folded group is no longer drawn round its things');
});

// proves: view_options_everywhere
test('merged, the links between the same two things are one, saying how many', () => {
  const plan = foldPlan(KEYS, SHAPE.links, [['Team', ['b', 'c']]], { hubs: false, groups: true, merge: true });
  const shape = foldedShape(SHAPE, plan);
  assert.deepEqual(
    shape.links.map((l) => `${l.from}>${l.to} ${l.type}`),
    ['a>group: 1 2 links', 'group: 1>d S'],
  );
});

// proves: view_options_everywhere
test('a folded hub keeps its place and gains a stub saying how many links it stands for', () => {
  const hub = {
    things: ['h', ...Array.from({ length: 13 }, (_, i) => `t${i}`), 'x'].map(thing),
    links: [
      ...Array.from({ length: 13 }, (_, i) => ({ from: 'h', type: 'R', to: `t${i}` })),
      { from: 'x', type: 'R', to: 't0' },
    ],
  };
  const plan = foldPlan(
    hub.things.map((t) => t.key),
    hub.links,
    [],
    { hubs: true, groups: false, merge: false },
  );
  assert.ok(plan, 'a hub of thirteen links is busy');
  const shape = foldedShape(hub, plan);
  assert.ok(shape.things.some((t) => t.key === 'h'));
  assert.ok(shape.things.some((t) => t.key === 'hub: 1' && /links$/.test(t.text)));
  assert.ok(shape.links.some((l) => l.from === 'h' && l.to === 'hub: 1'));
  assert.ok(!shape.things.some((t) => t.key === 't5'), 'a thing linked only to the hub is hidden with its links');
});

// proves: view_options_everywhere
test('with nothing folded, the shape is as it was', () => {
  assert.equal(foldedShape(SHAPE, undefined), SHAPE);
});
