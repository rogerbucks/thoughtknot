// Signposts, part of layer L4 (editor spec §68, level_regions): render/render-signs.ts. The whole of them is proved in
// render-marks.test.js; here, where one signpost stands at the edge of the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGN_PX, arrowOf, signAt } from '../src/render/render-signs.ts';
import { LIGHT } from '../src/render/render-look.ts';

const view = { x: 0, y: 0, scale: 1, w: 800, h: 600 };
const node = { key: 'm', name: 'Money' };

// proves: level_regions
test('a signpost stands at the clear edge on the way out, points that way, and fits the screen or is not made', () => {
  assert.equal(arrowOf(1, 0), '→');
  assert.equal(arrowOf(0, -1), '↑');
  const near = { x: 400, y: 300, r: 10 },
    far = { x: 2000, y: 300, r: 10 };
  const sign = signAt(near, far, node, view, '#e8833a', LIGHT, 1, 7);
  assert.equal(sign.text, '→ Money', 'it names the room, with the way to it');
  assert.equal(sign.y, 300, 'level with the way out');
  assert.ok(sign.x > 600 && sign.x < 800, 'at the right edge');
  assert.equal(sign.px, SIGN_PX);
  assert.equal(sign.edge, '#e8833a', 'edged in the room’s colour');
  assert.equal(sign.weight, 7);
  // the controls cover the right edge: it stands clear of them
  const kept = signAt(
    near,
    far,
    node,
    { ...view, clear: { top: 0, right: 200, bottom: 0, left: 0 } },
    '#000',
    LIGHT,
    1,
    1,
  );
  assert.ok(kept.x + kept.px < 600, 'inside the clear part');
  assert.equal(signAt(near, far, node, { ...view, w: 40 }, '#000', LIGHT, 1, 1), null, 'no room for it: none');
});
