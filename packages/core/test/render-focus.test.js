// Focus, part of layer L4 (editor spec §73, render_focus): render/render-focus.ts; the stage's side is in stage-focus.test.js.
// What the reader chooses or rests the pointer on is clearly marked, with its links and the ways to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { fitView } from '../src/render/render-camera.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { marksOf } from '../src/render/render-marks.ts';
import { pickRoad } from '../src/render/render-focus.ts';
import { paintCanvas } from '../src/render/paint-canvas.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

/** Three subjects of two areas each, Work linked to Money and Home, and Money to Home. */
function world() {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const links = [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2'), link('MA2', 'HA3')];
  const scene = sceneOf({ things, links });
  const spots = roomsOf(scene);
  return { scene, spots, sizes: roomSizes(scene, spots) };
}

const keyOf = (scene, name) => [...scene.nodes.values()].find((n) => n.name === name && n.depth === 0).key;
const joins = (m, a, b) => (m.a === a && m.b === b) || (m.a === b && m.b === a);

// Roger, 7 Nov 2026: elements should be clearly marked as selected, the node and its lines out.
// proves: render_focus
test('a thing in focus is ringed and named firmly, its roads drawn bold, and the other roads fade back', () => {
  const { scene, spots, sizes } = world();
  const view = fitView(spots.values(), 1280, 800);
  const detail = detailAt(sizes, view.scale);
  const [work, money, home] = ['Work', 'Money', 'Home'].map((n) => keyOf(scene, n));
  const plain = marksOf(scene, spots, detail, LIGHT, view);
  const marks = marksOf(scene, spots, detail, LIGHT, view, undefined, { keys: [work] });
  const cloud = marks.find((m) => m.kind === 'cloud' && m.key === work);
  assert.equal(cloud.ring, 1, 'its cloud has a full ring');
  assert.ok(cloud.bold, 'drawn thick');
  const name = marks.find((m) => m.kind === 'label' && m.key === work);
  assert.ok(name.bold && name.edge === LIGHT.ink, 'its name is edged firmly');
  for (const other of [money, home]) {
    const road = marks.find((m) => m.kind === 'road' && joins(m, work, other));
    const was = plain.find((m) => m.kind === 'road' && joins(m, work, other));
    assert.ok(road.halo, 'a road out of it stands clear of the roads it crosses');
    assert.ok(road.width > was.width && road.alpha === 1, 'and is drawn bold');
    assert.equal(marks.filter((m) => m.kind === 'road' && joins(m, work, other)).length, 1, 'once');
  }
  const aside = marks.find((m) => m.kind === 'road' && joins(m, money, home));
  const before = plain.find((m) => m.kind === 'road' && joins(m, money, home));
  assert.ok(aside.alpha < before.alpha * 0.5, 'a road that is not its own fades back');
  // nothing moves: the focus marks things, it never places them anew
  for (const m of plain.filter((p) => p.kind === 'cloud')) {
    const now = marks.find((q) => q.kind === 'cloud' && q.key === m.key);
    assert.deepEqual([now.x, now.y, now.r], [m.x, m.y, m.r]);
  }
  assert.deepEqual(marksOf(scene, spots, detail, LIGHT, view, undefined, { keys: [] }), plain, 'no focus, no change');
});

// Roger, 7 Nov 2026: on select, show the directions to linked nodes that are not visible close by.
// proves: render_focus
test('a chosen item points the way to each linked thing off screen, and draws a bold road to one on it', () => {
  const { scene, spots, sizes } = world();
  const wa0 = spots.get('WA0');
  // close on WA0: its link to MA0 leaves the screen
  const view = { x: wa0.x - 640 / 4, y: wa0.y - 400 / 4, scale: 4, w: 1280, h: 800 };
  const detail = detailAt(sizes, view.scale);
  const marks = marksOf(scene, spots, detail, LIGHT, view, undefined, { keys: ['WA0'] });
  const sign = marks.find((m) => m.kind === 'label' && m.key === 'MA0');
  assert.ok(sign, 'a signpost names the linked item off screen');
  assert.match(sign.text, /^[→↘↓↙←↖↑↗] Thing MA0$/);
  assert.ok(sign.x >= 0 && sign.y >= 0 && sign.x + sign.w <= 1280 && sign.y + sign.h <= 800, 'on the screen');
  const dot = marks.find((m) => m.kind === 'dot' && m.key === 'WA0');
  assert.equal(dot.ring, LIGHT.ink, 'the chosen item is ringed');
  // further out, with both ends of WA0's link to WA2's neighbour on screen, the link is drawn bold instead
  const mid = { x: (wa0.x + spots.get('MA0').x) / 2, y: (wa0.y + spots.get('MA0').y) / 2 };
  const both = fitView([wa0, spots.get('MA0')], 1280, 800);
  const wide = { ...both, x: mid.x - 640 / both.scale, y: mid.y - 400 / both.scale };
  const near = marksOf(scene, spots, detailAt(sizes, wide.scale), LIGHT, wide, undefined, { keys: ['WA0'] });
  const road = near.find((m) => m.kind === 'road' && joins(m, 'WA0', 'MA0'));
  assert.ok(road && road.halo, 'a bold road runs to the linked item on screen');
  assert.ok(!near.some((m) => m.kind === 'label' && m.key === 'MA0' && /^[→↘↓↙←↖↑↗] /.test(m.text)), 'with no sign');
  const end = near.find((m) => m.kind === 'dot' && m.key === 'MA0');
  if (end) assert.ok(end.ring, 'the item at its far end is ringed too');
});

// Roger, 7 Nov 2026: "Same as edges": a chosen edge is clearly marked too.
// proves: render_focus
test('a click on a road chooses it, and it is drawn bold with both its ends marked', () => {
  const { scene, spots, sizes } = world();
  const view = fitView(spots.values(), 1280, 800);
  const detail = detailAt(sizes, view.scale);
  const plain = marksOf(scene, spots, detail, LIGHT, view);
  const road = plain.find((m) => m.kind === 'road');
  const [x, y] = [(road.from[0] + road.to[0]) / 2 + 3, (road.from[1] + road.to[1]) / 2];
  assert.deepEqual(pickRoad(plain, x, y), { a: road.a, b: road.b }, 'a click on its line picks it');
  assert.equal(pickRoad(plain, -500, -500), null, 'empty space picks no road');
  const marks = marksOf(scene, spots, detail, LIGHT, view, undefined, { keys: [], road: { a: road.a, b: road.b } });
  const chosen = marks.find((m) => m.kind === 'road' && joins(m, road.a, road.b));
  assert.ok(chosen.halo && chosen.width > road.width, 'the chosen road is drawn bold');
  for (const key of [road.a, road.b]) assert.equal(marks.find((m) => m.kind === 'cloud' && m.key === key).ring, 1);
});

// proves: render_painters_agree
test('the painter rings a dot in focus, and lays a road in focus on a wider line of the paper', () => {
  const calls = [];
  const said = { strokes: [], widths: [] };
  const c = new Proxy(
    {},
    {
      get:
        (_, k) =>
        (...a) => (calls.push([k, ...a]), { addColorStop() {} }),
      set: (_, k, v) => {
        if (k === 'strokeStyle') said.strokes.push(v);
        if (k === 'lineWidth') said.widths.push(v);
        return true;
      },
    },
  );
  const road = { kind: 'road', a: 'a', b: 'b', from: [0, 0], to: [100, 0], forward: 1, back: 0, width: 4 };
  const dot = { kind: 'dot', key: 'd', x: 50, y: 50, r: 4, fill: '#4b7bf5', alpha: 1, ring: '#18202c' };
  paintCanvas(
    c,
    [{ ...road, fill: '#4b7bf5', count: '', ink: '#000', chip: '#fff', alpha: 1, halo: '#ffffff' }, dot],
    200,
    100,
  );
  assert.deepEqual(said.strokes.slice(0, 2), ['#ffffff', '#4b7bf5'], 'the paper line first, then the road on it');
  assert.deepEqual(said.widths.slice(0, 2), [8, 4]);
  assert.ok(
    calls.some((k) => k[0] === 'arc' && k[1] === 50 && k[3] === 7),
    'a ring just outside the dot',
  );
  assert.equal(said.strokes.at(-1), '#18202c');
});
