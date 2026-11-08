// The move from one diagram type to another (editor spec §73, render_type_morph): render/render-morph.ts. Things
// glide from their old places to their new ones, and a thing new to the view grows in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eased, morphed } from '../src/render/render-morph.ts';

const to = new Map([
  ['A', { x: 100, y: 0, r: 8 }],
  ['B', { x: 0, y: 50, r: 8 }],
]);
const from = new Map([['A', { x: 0, y: 0 }]]);

test('a thing starts at its old place and ends at its new one', () => {
  assert.deepEqual(morphed(from, to, 0).get('A'), { x: 0, y: 0, r: 8 });
  assert.deepEqual(morphed(from, to, 1).get('A'), { x: 100, y: 0, r: 8 });
  const half = morphed(from, to, 0.5).get('A');
  assert.ok(half.x > 0 && half.x < 100);
});

test('a thing the old type did not draw grows in at its own place', () => {
  assert.equal(morphed(from, to, 0).get('B').r, 0);
  assert.deepEqual(morphed(from, to, 1).get('B'), { x: 0, y: 50, r: 8 });
});

test('the move eases in and out and stays within its ends', () => {
  assert.equal(eased(0), 0);
  assert.equal(eased(1), 1);
  assert.equal(eased(2), 1);
  assert.ok(eased(0.25) < 0.25 && eased(0.75) > 0.75);
});

test('a stage says where each thing shows on the screen, for the stage after it', async () => {
  const { seenOf } = await import('../src/display/graph-view/stage-morph.ts');
  const view = { x: 10, y: 20, scale: 2, w: 400, h: 300 };
  const seen = seenOf(view, new Map([['A', { x: 30, y: 40, r: 8 }]]));
  assert.deepEqual(seen.from.get('A'), { x: 40, y: 40 });
  assert.deepEqual(seen.view, { cx: 110, cy: 95, k: 2 });
});
