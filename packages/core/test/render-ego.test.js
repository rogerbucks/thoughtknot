// The ego view on the new rendering (editor spec §73, render_ego): render/render-ego.ts. One thing sits in the middle.
// Those one or two links away sit on rings round it, each in its subject's colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { egoOf, EGO_STEP } from '../src/render/render-ego.ts';
import { chipsApart } from '../src/render/render-roads.ts';

const thing = (key, subject) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map([['subject', subject]]),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

function shape() {
  const things = [thing('hub', 'Work'), thing('far', 'Money'), thing('away', 'Money')];
  const links = [link('hub', 'far'), link('far', 'away')];
  for (let i = 0; i < 30; i++) {
    things.push(thing(`n${i}`, i % 2 ? 'Work' : 'Money'));
    links.push(link('hub', `n${i}`));
  }
  // one thing three links away, which an ego view leaves out
  things.push(thing('gone', 'Work'));
  links.push(link('away', 'gone'));
  return { things, links };
}

// proves: render_ego
test('the busiest thing sits in the middle, its links on a ring round it, those two away outside; the rest are left out', () => {
  const s = shape();
  const ego = egoOf(s, sceneOf(s));
  assert.ok(ego);
  const at = (k) => ego.spots.get(k);
  assert.deepEqual([at('hub').x, at('hub').y], [0, 0], 'the busiest is the middle');
  const r = (k) => Math.hypot(at(k).x, at(k).y);
  assert.ok(r('away') > r('far'), 'two links away is outside one link away');
  assert.equal(ego.spots.has('gone'), false, 'three links away is not drawn');
  assert.equal(ego.scene.depths.length, 1, 'one level: every thing is shown');
  // the ring is wide enough that its things sit a card apart
  const ring = [...ego.spots.entries()].filter(([k]) => k.startsWith('n')).map(([, p]) => p);
  const gap = Math.min(
    ...ring.map((p, i) => Math.min(...ring.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.y - q.y)))),
  );
  assert.ok(gap >= EGO_STEP * 0.95, `things on a ring sit ${gap} apart`);
  assert.ok(
    ego.scene.roads[0].some((road) => [road.a, road.b].includes('hub')),
    'links among them are its roads',
  );
});

// proves: render_ego
test('each thing keeps the colour of its subject in the network, or the one picked for that subject', () => {
  const s = shape();
  const full = sceneOf(s);
  const ego = egoOf(s, full);
  const work = full.named.findIndex((k) => full.nodes.get(k).name === 'Work');
  assert.equal(ego.own('hub'), work);
  assert.equal(ego.own('n1'), work, 'a thing of the same subject, the same colour');
  assert.notEqual(ego.own('far'), work);
  const picked = egoOf(s, full, undefined, () => 5);
  assert.equal(picked.own('hub'), 5, 'a colour picked for its subject wins');
});

// proves: render_ego
test('close in, a road keeps its words only where they fit clear of the others', () => {
  const road = (x, y, len) => ({
    kind: 'road',
    a: 'a',
    b: 'b',
    from: [x, y],
    to: [x + len, y],
    forward: 1,
    back: 0,
    width: 2,
    fill: '#000',
    count: 'proved by',
    chevrons: [],
    ink: '#000',
    chip: '#fff',
    alpha: 1,
  });
  const [kept, piled, short] = chipsApart([road(0, 0, 300), road(10, 4, 300), road(0, 200, 40)]);
  assert.equal(kept.count, 'proved by');
  assert.equal(piled.count, '', 'words over words are left off');
  assert.equal(short.count, '', 'words longer than their road are left off');
});
