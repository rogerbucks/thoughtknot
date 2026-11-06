// The camera, layer L6 of the rendering spec (editor spec §73, render_one_camera): render/render-camera.ts. It fits the
// drawing, pans with the pointer, and zooms in stops so one notch moves at most one level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailAt } from '../src/render/render-detail.ts';
import { fitView, panView, stepView, stopsOf, zoomTo } from '../src/render/render-camera.ts';

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
