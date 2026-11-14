// Cards kept inside their groups' clouds (editor spec §73, render_cards): render/render-cards-rooms.ts. With Cards on,
// the cards in a group are parted among themselves. The group fits round them, and groups are parted whole. So a card
// lies inside its own group's cloud and no other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_PAD, keepInRooms } from '../src/render/render-cards-rooms.ts';
import { cardsLaid } from '../src/render/render-cards.ts';

/** A scene of two levels: each group holds its items. */
function sceneOf(groups) {
  const nodes = new Map();
  for (const [g, items] of Object.entries(groups)) {
    nodes.set(g, { key: g, name: g, depth: 0, children: items, items });
    for (const k of items) nodes.set(k, { key: k, name: k, depth: 1, parent: g, children: [], items: [k] });
  }
  return { depths: ['group', 'item'], nodes, roots: Object.keys(groups), named: Object.keys(groups), roads: [[], []] };
}

/** Whether the whole of card `b` lies inside the round `s`, kept in from its edge by `pad`. */
const inside = (b, s, pad = 0) =>
  [
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ].every(([i, j]) => Math.hypot(b.x + (i * b.w) / 2 - s.x, b.y + (j * b.h) / 2 - s.y) <= s.r - pad + 1e-6);
/** Whether any of card `b` reaches inside the round `s`. */
const reaches = (b, s) => {
  const nx = Math.max(b.x - b.w / 2, Math.min(s.x, b.x + b.w / 2)),
    ny = Math.max(b.y - b.h / 2, Math.min(s.y, b.y + b.h / 2));
  return Math.hypot(nx - s.x, ny - s.y) < s.r;
};

// proves: render_cards
test('every card stays inside its own group cloud and out of every other, the same each time', () => {
  // two groups laid out for dots: small clouds, close together, far too small for cards
  const scene = sceneOf({ Work: ['w0', 'w1', 'w2'], Home: ['h0', 'h1', 'h2'] });
  const spots = new Map([
    ['Work', { x: 0, y: 0, r: 40 }],
    ['Home', { x: 100, y: 0, r: 40 }],
    ['w0', { x: -15, y: 0, r: 4 }],
    ['w1', { x: 0, y: 0, r: 4 }],
    ['w2', { x: 15, y: 0, r: 4 }],
    ['h0', { x: 85, y: 0, r: 4 }],
    ['h1', { x: 100, y: 0, r: 4 }],
    ['h2', { x: 115, y: 0, r: 4 }],
  ]);
  const texts = new Map([...scene.nodes.keys()].map((k) => [k, { key: k, name: k, note: 'a\nb\nc' }]));
  const laid = cardsLaid(scene, spots, texts, []);
  const cloud = (g) => laid.spots.get(g);
  for (const c of laid.cards) {
    const own = scene.nodes.get(c.key).parent,
      other = own === 'Work' ? 'Home' : 'Work';
    assert.ok(inside(c, cloud(own), ROOM_PAD), `${c.key} lies inside ${own}'s cloud, clear of its fading edge`);
    assert.ok(!reaches(c, cloud(other)), `${c.key} stays out of ${other}'s cloud`);
  }
  const [w, h] = [cloud('Work'), cloud('Home')];
  assert.ok(Math.hypot(w.x - h.x, w.y - h.y) >= w.r + h.r, 'the clouds do not cover one another');
  assert.ok(w.x < h.x, 'Work stays left of Home');
  const again = cardsLaid(scene, new Map([...spots].reverse()), texts, []);
  assert.deepEqual(
    again.cards.map((c) => [c.key, c.x, c.y]).sort(),
    laid.cards.map((c) => [c.key, c.x, c.y]).sort(),
    'the same places whatever order',
  );
});

// proves: render_cards
test('a group in a group grows round the inner one, and a drawing with no groups only parts its cards', () => {
  const nodes = new Map([
    ['Top', { key: 'Top', name: 'Top', depth: 0, children: ['Mid'], items: ['a', 'b'] }],
    ['Mid', { key: 'Mid', name: 'Mid', depth: 1, parent: 'Top', children: ['a', 'b'], items: ['a', 'b'] }],
    ['a', { key: 'a', name: 'a', depth: 2, parent: 'Mid', children: [], items: ['a'] }],
    ['b', { key: 'b', name: 'b', depth: 2, parent: 'Mid', children: [], items: ['b'] }],
  ]);
  const scene = { depths: ['t', 'm', 'i'], nodes, roots: ['Top'], named: ['Top'], roads: [[], [], []] };
  const spots = new Map([
    ['Top', { x: 0, y: 0, r: 20 }],
    ['Mid', { x: 0, y: 0, r: 10 }],
  ]);
  const boxes = [
    { key: 'a', x: 0, y: 0, w: 240, h: 60 },
    { key: 'b', x: 0, y: 0, w: 240, h: 60 },
  ];
  keepInRooms(scene, spots, boxes);
  const [top, mid] = [spots.get('Top'), spots.get('Mid')];
  for (const b of boxes) assert.ok(inside(b, mid, ROOM_PAD), `${b.key} inside Mid`);
  assert.ok(Math.hypot(mid.x - top.x, mid.y - top.y) + mid.r <= top.r, 'Mid inside Top');
  // no groups: the cards part, nothing else
  const flat = { depths: ['i'], nodes: new Map([['a', nodes.get('a')]]), roots: ['a'], named: ['a'], roads: [[]] };
  const two = [
    { key: 'a', x: 0, y: 0, w: 240, h: 60 },
    { key: 'b', x: 0, y: 0, w: 240, h: 60 },
  ];
  keepInRooms(flat, new Map(), two);
  assert.ok(Math.abs(two[0].y - two[1].y) >= 60, 'the two cards part');
});
