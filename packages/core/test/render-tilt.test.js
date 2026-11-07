// The tilted camera (phase P3 of wiki/Rendering-spec.md; editor spec §73, render_one_camera): render/render-tilt.ts.
// 2.5D and 3D see the same marks as 2D from an angle. No tilt is the flat picture; far is smaller; nothing moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { marksOf, onScreen } from '../src/render/render-marks.ts';
import { fitView } from '../src/render/render-camera.ts';
import { isTilted, tilted } from '../src/render/render-tilt.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

function drawing() {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2')] });
  const spots = roomsOf(scene);
  return { scene, spots, sizes: roomSizes(scene, spots) };
}

const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

// proves: render_one_camera
test('with no tilt the picture is the flat one; tipped back, far things are smaller and the middle stays put', () => {
  // Roger, 7 Nov 2026: the old 2.5D and 3D look goes; they see the same marks as 2D, from an angle
  const flat = { x: 0, y: 0, scale: 1, w: 1000, h: 600 };
  assert.equal(isTilted(flat), false);
  assert.deepEqual(onScreen({ x: 120, y: 80, r: 10 }, flat), { x: 120, y: 80, r: 10 }, 'no tilt: as flat');
  assert.deepEqual(onScreen({ x: 120, y: 80, r: 10 }, { ...flat, tilt: 0, turn: 0 }), { x: 120, y: 80, r: 10 });
  const view = { ...flat, tilt: 0.7 };
  assert.ok(isTilted(view));
  const middle = tilted(500, 300, 0, view);
  assert.ok(Math.abs(middle.x - 500) < 1e-9 && Math.abs(middle.y - 300) < 1e-9 && middle.k === 1, 'the middle stays');
  const far = onScreen({ x: 500, y: 50, r: 20 }, view),
    near = onScreen({ x: 500, y: 550, r: 20 }, view);
  assert.ok(far.r < 20 && near.r > 20, 'far things are smaller, near ones bigger');
  assert.ok(far.y < 300 && near.y > 300, 'far stays above the middle, near below');
  assert.ok(300 - far.y < 250 && near.y - 300 < 250, 'the ground is foreshortened');
  // a lifted point comes nearer and rises on the screen
  const lifted = tilted(500, 300, 40, view);
  assert.ok(lifted.k > 1 && lifted.y < 300);
  // a quarter turn takes the right of the screen to the bottom
  const turned = tilted(600, 300, 0, { ...flat, turn: Math.PI / 2 });
  assert.ok(Math.abs(turned.x - 500) < 1e-9 && Math.abs(turned.y - 400) < 1e-9);
});

// proves: render_one_camera
test('tipped back, the same marks are drawn: far clouds first, rooms under what they hold, names never overlap, nothing moves', () => {
  const { scene, spots, sizes } = drawing();
  const kept = new Map([...spots].map(([k, s]) => [k, { ...s }]));
  const fit = fitView(spots.values(), 1280, 800);
  const view = { ...fit, tilt: 0.8, turn: 0.3 };
  const flat = marksOf(scene, spots, detailAt(sizes, fit.scale), LIGHT, fit);
  const marks = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view);
  const kinds = (ms) => [...new Set(ms.map((m) => m.kind))].sort();
  assert.deepEqual(kinds(marks), kinds(flat), 'the same kinds of marks as flat');
  const clouds = marks.filter((m) => m.kind === 'cloud');
  const depth = (m) => scene.nodes.get(m.key).depth;
  for (let i = 1; i < clouds.length; i++) {
    const [a, b] = [clouds[i - 1], clouds[i]];
    assert.ok(depth(a) < depth(b) || (depth(a) === depth(b) && a.y <= b.y), 'far first, a room under its insides');
  }
  const labels = marks.filter((m) => m.kind === 'label');
  assert.ok(labels.length > 0);
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), labels[i].text);
  assert.deepEqual(spots, kept, 'the camera moved, nothing in the drawing did');
});
