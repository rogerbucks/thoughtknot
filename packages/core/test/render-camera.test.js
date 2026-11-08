// The camera, layer L6 of the rendering spec (editor spec §73, render_one_camera): render/render-camera.ts. It fits the
// drawing, pans with the pointer, and zooms smoothly, never in steps (Roger, 6 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailAt } from '../src/render/render-detail.ts';
import {
  centreOn,
  fitView,
  glideView,
  panView,
  pinchView,
  pickAt,
  stopsOf,
  wheelView,
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
test('a trackpad zooms smoothly: small movements zoom a little each, never a jump to the next level', () => {
  const stops = stopsOf(sizes, 0.2);
  let v = { x: 0, y: 0, scale: 0.2, w: 800, h: 600 };
  const scales = [v.scale];
  // a pinch on a Mac trackpad: many wheel events of a few pixels each
  for (let i = 0; i < 400; i++) {
    v = wheelView(v, stops, -4, [400, 300]);
    scales.push(v.scale);
  }
  for (let i = 1; i < scales.length; i++) {
    const k = scales[i] / scales[i - 1];
    assert.ok(k >= 1 && k < 1.03, `one small movement zoomed by ${k}`);
  }
  assert.equal(detailAt(sizes, v.scale).level, 2, 'every level is reached');
  assert.ok(v.scale <= stops.at(-1) * 4 + 1e-9, 'a little past the last level, no further');
  // a mouse's big notch zooms by about half, never a leap
  const notch = wheelView({ ...v, scale: 1 }, [0.1, 10], -100, [400, 300]);
  assert.ok(notch.scale > 1.2 && notch.scale < 1.6, `${notch.scale}`);
  for (let i = 0; i < 400; i++) v = wheelView(v, stops, 4, [400, 300]);
  assert.equal(v.scale, 0.1, 'back out to half the fitted view, room for names round it, no further');
  assert.ok(
    Math.abs(pinchView(v, stops, 1.5, [400, 300]).scale - 0.15) < 1e-9,
    'fingers spread by half zoom in by half',
  );
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
test('the pointer passes through a dot or cloud whose level is not being read, to what shows', () => {
  const marks = [
    { kind: 'cloud', key: 'area', x: 100, y: 100, r: 80, fill: '#f00', alpha: 0.3 },
    { kind: 'cloud', key: 'topic', x: 120, y: 100, r: 30, fill: '#0f0', alpha: 0.06, pick: false },
    { kind: 'dot', key: 'item', x: 125, y: 104, r: 3, fill: '#00f', alpha: 0.8, pick: false },
  ];
  assert.equal(pickAt(marks, 125, 104), 'area', 'a hidden item and topic are passed through');
  assert.equal(pickAt([{ ...marks[0], pick: false }], 100, 100), null, 'a group whose insides are open is ground');
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

// Roger, 7 Nov 2026 (nightly): zooming out did not reach level 1 where the fitted view already opened level 2.
// proves: render_one_camera
test('zoomed right out, the first level always shows, even where the fit opens the second', () => {
  for (const fitted of [0.2, 0.6, 1.2, 3]) {
    const stops = stopsOf(sizes, fitted);
    let v = { x: 0, y: 0, scale: fitted, w: 800, h: 600 };
    for (let i = 0; i < 400; i++) v = wheelView(v, stops, 40, [400, 300]);
    assert.equal(detailAt(sizes, v.scale).shown[1], 0, `fitted at ${fitted}: only the first level shows`);
    assert.ok(v.scale <= fitted, 'never nearer than the fit');
    assert.ok(v.scale >= Math.min(fitted * 0.5, (0.8 * 56) / sizes[1]), 'and no further out than it takes');
  }
});
