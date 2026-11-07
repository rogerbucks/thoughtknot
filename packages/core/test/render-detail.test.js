// Detail on zoom, layer L3 of the rendering spec (editor spec §73, render_detail): render/render-detail.ts. Far out
// only subjects show; each level fades in as its rooms grow on screen, never before the level above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { OPEN_AT, OPEN_FROM, detailAt, roomSizes, scaleToOpen } from '../src/render/render-detail.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});

/** Two subjects of two areas, each with six things. */
function scene() {
  const things = [];
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 6; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  return sceneOf({ things, links: [] });
}

// proves: render_detail
test('far out only the top level shows, and close in every level does', () => {
  const s = scene();
  const sizes = roomSizes(s, roomsOf(s));
  assert.equal(sizes.length, 3);
  const { shown, level } = detailAt(sizes, 0.01);
  assert.deepEqual({ shown, level }, { shown: [1, 0, 0], level: 0 });
  const near = detailAt(sizes, 100);
  assert.deepEqual({ shown: near.shown, level: near.level }, { shown: [1, 1, 1], level: 2 });
  assert.deepEqual(
    near.span,
    sizes.map((size) => size * 100),
    "how wide each depth's rooms are on screen",
  );
});

// proves: render_detail
test('a level fades in over a band of zoom, without a jump', () => {
  const sizes = [400, 100, 17];
  const steps = Array.from({ length: 200 }, (_, i) => detailAt(sizes, 0.2 + i * 0.01).shown[1]);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] >= steps[i - 1], 'only grows as you zoom in');
    assert.ok(steps[i] - steps[i - 1] < 0.1, 'never jumps');
  }
  assert.equal(detailAt(sizes, (OPEN_FROM - 1) / 100).shown[1], 0);
  assert.equal(detailAt(sizes, (OPEN_AT + 1) / 100).shown[1], 1);
});

// proves: render_detail
test('a deeper level never shows more than the one above it', () => {
  const sizes = [400, 60, 40];
  for (let scale = 0.1; scale < 5; scale += 0.05) {
    const { shown } = detailAt(sizes, scale);
    for (let d = 1; d < shown.length; d++) assert.ok(shown[d] <= shown[d - 1]);
  }
});

// proves: render_detail
test('the zoom that opens each level is the step a wheel notch goes to', () => {
  const sizes = [400, 100, 17];
  assert.equal(scaleToOpen(sizes, 0), 0);
  for (const depth of [1, 2]) assert.equal(detailAt(sizes, scaleToOpen(sizes, depth)).level, depth);
});
