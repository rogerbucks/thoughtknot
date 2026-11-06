// The camera, layer L6 of the rendering spec (editor spec §73, render_one_camera): render/render-camera.ts. It fits the
// drawing, pans with the pointer, and zooms in stops so one notch moves at most one level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailAt } from '../src/render/render-detail.ts';
import {
  centreOn,
  fitView,
  glideView,
  panView,
  pickAt,
  stepView,
  stopsOf,
  zoomTo,
} from '../src/render/render-camera.ts';

const sizes = [400, 100, 17];

// proves: render_one_camera
test('fitting puts every spot on screen, in the middle', () => {
  const v = fitView(
    [
      { x: 0, y: 0, r: 100 },
      { x: 500, y: 0, r: 100 },
    ],
    800,
    400,
  );
  const screen = (x) => (x - v.x) * v.scale;
  assert.ok(screen(-100) >= 0 && screen(600) <= 800);
  assert.ok(Math.abs(screen(250) - 400) < 1e-6);
});

// proves: render_one_camera
test('a notch in never opens more than one level, and never zooms more than twice', () => {
  const stops = stopsOf(sizes, 0.2);
  let v = { x: 0, y: 0, scale: 0.2, w: 800, h: 600 };
  const levels = [detailAt(sizes, v.scale).level];
  for (let i = 0; i < 8; i++) {
    const was = v.scale;
    v = stepView(v, stops, 1, [400, 300]);
    assert.ok(v.scale <= was * 2 + 1e-9);
    levels.push(detailAt(sizes, v.scale).level);
  }
  for (let i = 1; i < levels.length; i++) assert.ok([0, 1].includes(levels[i] - levels[i - 1]), levels.join());
  assert.equal(levels.at(-1), 2, 'every level is reached');
  const back = [levels.at(-1)];
  for (let i = 0; i < 12; i++) {
    v = stepView(v, stops, -1, [400, 300]);
    back.push(detailAt(sizes, v.scale).level);
  }
  for (let i = 1; i < back.length; i++) assert.ok([0, 1].includes(back[i - 1] - back[i]), back.join());
  assert.equal(v.scale, 0.2, 'back out to the fitted view');
});

// proves: render_one_camera
test('zooming keeps the point under the pointer still, and panning follows the pointer', () => {
  const v = { x: 10, y: 20, scale: 1, w: 800, h: 600 };
  const z = zoomTo(v, 3, [200, 100]);
  assert.ok(Math.abs(200 / v.scale + v.x - (200 / z.scale + z.x)) < 1e-9);
  const p = panView(v, 50, -30);
  assert.deepEqual([p.x, p.y], [-40, 50]);
});

// proves: render_one_camera
test('fitting keeps the drawing out of what the controls cover, unless that leaves too little', () => {
  const spots = [
    { x: 0, y: 0, r: 100 },
    { x: 500, y: 0, r: 100 },
  ];
  const clear = { top: 0, right: 0, bottom: 0, left: 300 };
  const v = fitView(spots, 1000, 400, clear);
  const screen = (x) => (x - v.x) * v.scale;
  assert.ok(screen(-100) >= 300, 'clear of the docks on the left');
  assert.ok(screen(600) <= 1000);
  assert.deepEqual(v.clear, clear);
  const narrow = fitView(spots, 400, 400, clear);
  assert.deepEqual(narrow.clear, { top: 0, right: 0, bottom: 0, left: 0 }, 'a narrow card ignores the controls');
});

// A click picks from the marks, never from the page (rule 1). First the name on top, then a dot within reach, then the
// smallest cloud round the point.
// proves: render_one_camera
test('a click picks the name on top, then the nearest dot, then the smallest cloud, and nothing on empty space', () => {
  const marks = [
    { kind: 'cloud', key: 'big', x: 100, y: 100, r: 80, fill: '#f00', alpha: 1 },
    { kind: 'cloud', key: 'small', x: 120, y: 100, r: 30, fill: '#0f0', alpha: 1 },
    { kind: 'dot', key: 'a', x: 125, y: 104, r: 3, fill: '#00f', alpha: 1 },
    { kind: 'dot', key: 'b', x: 140, y: 104, r: 3, fill: '#00f', alpha: 1 },
    {
      kind: 'label',
      key: 'named',
      text: 'Named',
      x: 60,
      y: 60,
      w: 50,
      h: 20,
      px: 12,
      fill: '#fff',
      ink: '#000',
      alpha: 1,
    },
  ];
  assert.equal(pickAt(marks, 70, 70), 'named');
  assert.equal(pickAt(marks, 127, 104), 'a', 'the nearer dot');
  assert.equal(pickAt(marks, 135, 104), 'b', 'a dot within a fingertip');
  assert.equal(pickAt(marks, 120, 125), 'small', 'the smaller cloud round the point');
  assert.equal(pickAt(marks, 40, 140), 'big');
  assert.equal(pickAt(marks, 300, 300), null);
});

// proves: render_one_camera
test('centring puts a spot in the middle of the clear part, and a glide runs evenly from one view to the other', () => {
  const view = { x: 0, y: 0, scale: 2, w: 400, h: 300, clear: { top: 0, right: 0, bottom: 0, left: 100 } };
  const to = centreOn(view, { x: 50, y: 40, r: 5 }, 4);
  assert.equal(to.scale, 4);
  assert.equal((50 - to.x) * to.scale, 250, 'across: the middle of the 300 pixels left clear');
  assert.equal((40 - to.y) * to.scale, 150);
  assert.deepEqual(glideView(view, to, 0), { ...to, x: view.x, y: view.y, scale: view.scale });
  const end = glideView(view, to, 1);
  assert.ok(Math.abs(end.x - to.x) < 1e-9 && Math.abs(end.y - to.y) < 1e-9 && end.scale === to.scale);
  const half = glideView(view, to, 0.5);
  assert.ok(Math.abs(half.scale - Math.sqrt(2 * 4)) < 1e-9, 'halfway in zoom to the eye');
});
