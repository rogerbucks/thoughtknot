// The scene, layer L1 of the rendering spec (editor spec §73, render_scene): render/render-scene.ts. One tree, far to
// near, with the links rolled up at each level and counted each way. Named levels win over levels found from links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';

/** A thing of the shape, with the subject, area and topic it names, if any. */
const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

/** Two subjects, each with two areas of three things. */
function named() {
  const things = [];
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 3; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const links = [link('WA0', 'MA0'), link('WA1', 'MB0'), link('MB1', 'WB2'), link('WA0', 'WB0'), link('WA0', 'WA1')];
  return { things, links };
}

// proves: render_scene
test('a graph whose things name a subject and an area is a tree of those subjects, areas and items', () => {
  const scene = sceneOf(named());
  assert.equal(scene.depths.length, 3);
  assert.deepEqual(scene.roots.map((k) => scene.nodes.get(k).name).sort(), ['Money', 'Work']);
  const work = scene.nodes.get(scene.roots.find((k) => scene.nodes.get(k).name === 'Work'));
  assert.deepEqual(
    work.children.map((k) => scene.nodes.get(k).name),
    ['A', 'B'],
  );
  assert.equal(work.items.length, 6);
  const item = scene.nodes.get('WA0');
  assert.equal(item.depth, 2);
  assert.equal(scene.nodes.get(item.parent).parent, work.key);
});

// proves: render_scene
test('links are rolled up at each level and counted each way', () => {
  const scene = sceneOf(named());
  const [subjects] = scene.roads;
  assert.equal(subjects.length, 1);
  const road = subjects[0];
  const work = scene.roots.find((k) => scene.nodes.get(k).name === 'Work');
  const [fromWork, toWork] = road.a === work ? [road.forward, road.back] : [road.back, road.forward];
  assert.deepEqual([fromWork, toWork], [2, 1]);
  // inside Work, A to B once; at the item level every link but none to itself
  assert.equal(
    scene.roads[1].reduce((n, r) => n + r.forward + r.back, 0),
    4,
  );
  assert.equal(scene.roads[2].length, 5);
});

// proves: render_scene
test('the same graph written in another order gives the same scene, but for the order subjects are first named', () => {
  const a = named(),
    b = { things: [...a.things].reverse(), links: [...a.links].reverse() };
  const flat = (s) => JSON.stringify({ ...s, named: undefined, nodes: [...s.nodes.entries()] });
  assert.equal(flat(sceneOf(a)), flat(sceneOf(b)));
  // only the colour order follows the writer: the first subject named takes the first colour
  assert.deepEqual(sceneOf(b).named, [...sceneOf(a).named].reverse());
});

// proves: render_scene
test('a handful of things is one level, every item at the top', () => {
  const scene = sceneOf({ things: [thing('a'), thing('b'), thing('c')], links: [link('a', 'b')] });
  assert.equal(scene.depths.length, 1);
  assert.deepEqual(scene.roots, ['a', 'b', 'c']);
  assert.deepEqual(scene.roads[0], [{ a: 'a', b: 'b', forward: 1, back: 0, types: ['RELATES'] }]);
});
