// The marks, layer L4 of the rendering spec (editor spec §73, render_marks): render/render-marks.ts. Plain marks on the
// screen, with one label placer: names held between 11 and 16 px, inside the view, never overlapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { MAX_PX, MIN_PX, coloursOf, cloudAlpha, countOf, marksOf, placeLabels } from '../src/render/render-marks.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

function picture(scale) {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2')] });
  const spots = roomsOf(scene);
  const detail = detailAt(roomSizes(scene, spots), scale);
  const marks = marksOf(scene, spots, detail, LIGHT, { x: 0, y: 0, scale, w: 1280, h: 800 });
  return { scene, marks };
}

const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

// proves: render_marks
test('labels are between 11 and 16 px, inside the view and never overlap, at every zoom', () => {
  for (const scale of [0.3, 0.6, 1, 2, 4]) {
    const labels = picture(scale).marks.filter((m) => m.kind === 'label');
    for (const l of labels) {
      assert.ok(l.px >= MIN_PX && l.px <= MAX_PX, `${l.text} at ${l.px}px`);
      assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= 1280 && l.y + l.h <= 800, `${l.text} is cut`);
    }
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), `${labels[i].text}`);
  }
});

// proves: render_marks
test('far out the subjects are named and joined by roads; close in the items are named', () => {
  const far = picture(0.3).marks;
  const names = far.filter((m) => m.kind === 'label').map((m) => m.text);
  assert.deepEqual([...names].sort(), ['Home', 'Money', 'Work']);
  const roads = far.filter((m) => m.kind === 'road');
  assert.ok(roads.length >= 2);
  assert.ok(roads.every((r) => r.width >= 2));
  const near = picture(6).marks.filter((m) => m.kind === 'label');
  assert.ok(near.some((m) => m.text.startsWith('Thing ')));
});

// proves: render_marks
test('when two names clash, the heavier keeps its place', () => {
  const asks = [
    { key: 'small', text: 'Small', x: 100, y: 100, px: 12, fill: '#ffffff', alpha: 1, weight: 1 },
    { key: 'big', text: 'Big', x: 104, y: 102, px: 12, fill: '#ffffff', alpha: 1, weight: 9 },
  ];
  assert.deepEqual(
    placeLabels(asks, { x: 0, y: 0, scale: 1, w: 400, h: 300 }).map((l) => l.key),
    ['big'],
  );
});

// proves: render_marks
test('each subject has its own colour and its areas take shades of it', () => {
  const { scene } = picture(1);
  const colours = coloursOf(scene, LIGHT);
  const subjects = scene.roots.map((k) => colours.get(k));
  assert.equal(new Set(subjects).size, subjects.length);
  const work = scene.nodes.get(scene.roots.find((k) => scene.nodes.get(k).name === 'Work'));
  const areas = work.children.map((k) => colours.get(k));
  assert.equal(new Set(areas).size, areas.length);
});

// proves: render_marks
test('a road says its count each way, and a single link says nothing', () => {
  assert.equal(countOf(3, 1), '3 ⇄ 1');
  assert.equal(countOf(2, 0), '2 →');
  assert.equal(countOf(0, 4), '← 4');
  assert.equal(countOf(1, 0), '');
});

// proves: render_marks
test('roads join only neighbours in the same room', () => {
  const { scene, marks } = picture(2);
  for (const r of marks.filter((m) => m.kind === 'road'))
    assert.equal(scene.nodes.get(r.a).parent, scene.nodes.get(r.b).parent, `${r.a} to ${r.b}`);
});

// proves: render_look_in_marks
test('a cloud fades once the level inside opens, and one bigger than the screen never washes it out', () => {
  const view = { x: 0, y: 0, scale: 1, w: 800, h: 600 };
  const small = { x: 400, y: 300, r: 100 };
  assert.ok(cloudAlpha(1, small, view) > cloudAlpha(0.2, small, view));
  const huge = { x: 400, y: 300, r: 8000 };
  assert.ok(cloudAlpha(1, huge, view) < cloudAlpha(1, small, view) / 2);
  assert.ok(cloudAlpha(1, huge, view) > 0, 'the ground still shows');
});
