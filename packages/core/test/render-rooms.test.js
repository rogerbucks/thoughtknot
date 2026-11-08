// Rooms first, layer L2 of the rendering spec (editor spec §73, render_rooms): render/render-rooms.ts. Each group is a
// round room holding its children, rooms never overlap, and the same scene always gives the same places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { ITEM_GAP, chain, roomsOf } from '../src/render/render-rooms.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

/** Three subjects of two or three areas, each with a handful of things; Work and Money linked most. */
function named() {
  const things = [];
  const plan = { Work: ['A', 'B', 'C'], Money: ['A', 'B'], Home: ['A', 'B'] };
  for (const [subject, areas] of Object.entries(plan))
    for (const area of areas)
      for (let i = 0; i < 5 + area.charCodeAt(0) - 65; i++)
        things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const links = [link('WA0', 'MA0'), link('WA1', 'MA1'), link('WB0', 'MB0'), link('HA0', 'WC0'), link('WA0', 'WB0')];
  return { things, links };
}

const apart = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

// proves: render_rooms
test('every node has a place, and each child sits inside its parent room', () => {
  const scene = sceneOf(named());
  const spots = roomsOf(scene);
  assert.equal(spots.size, scene.nodes.size);
  for (const node of scene.nodes.values()) {
    if (node.parent === undefined) continue;
    const at = spots.get(node.key),
      room = spots.get(node.parent);
    assert.ok(apart(at, room) + at.r <= room.r + 1e-6, `${node.key} spills out of ${node.parent}`);
  }
});

// proves: render_rooms
test('siblings never overlap, rooms or items', () => {
  const scene = sceneOf(named());
  const spots = roomsOf(scene);
  const groups = [scene.roots, ...[...scene.nodes.values()].map((n) => n.children)];
  for (const kids of groups)
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const p = spots.get(kids[i]),
          q = spots.get(kids[j]);
        assert.ok(apart(p, q) >= p.r + q.r - 1e-6, `${kids[i]} overlaps ${kids[j]}`);
      }
});

// proves: render_rooms
test('items in a room are at least one gap apart', () => {
  const scene = sceneOf(named());
  const spots = roomsOf(scene);
  const room = scene.nodes.get(scene.nodes.get('WA0').parent);
  for (let i = 0; i < room.children.length; i++)
    for (let j = i + 1; j < room.children.length; j++)
      assert.ok(apart(spots.get(room.children[i]), spots.get(room.children[j])) >= ITEM_GAP * 0.9);
});

// proves: render_rooms
test('the same graph written in another order gives the same places', () => {
  const a = named(),
    b = { things: [...a.things].reverse(), links: [...a.links].reverse() };
  assert.deepEqual([...roomsOf(sceneOf(a))], [...roomsOf(sceneOf(b))]);
});

// proves: render_rooms
test('the most linked keys sit side by side in a row', () => {
  const linked = new Map([
    ['a\nd', 5],
    ['b\nc', 1],
    ['c\nd', 3],
  ]);
  const row = chain(['a', 'b', 'c', 'd'], linked);
  const next = (x, y) => Math.abs(row.indexOf(x) - row.indexOf(y)) === 1;
  assert.ok(next('a', 'd') && next('c', 'd') && next('b', 'c'), row.join(' '));
  assert.deepEqual(chain(['a', 'b', 'c', 'd'], linked), row);
});
