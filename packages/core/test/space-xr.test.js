// The view in space seen in a headset (editor spec §68, projection_spatial): space-xr.ts. The drawing stands on a
// table at arm's length, and pointing at a thing picks the nearest box the ray meets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM, multiply, xrModel, xrPick } from '../src/space-xr.ts';

const block = (id, x, y, floor = 0) => ({ id, of: id, style: 'thing', x, y, width: 10, depth: 10, floor, tall: 10 });
const SPACE = {
  blocks: [block('a', 0, 0), block('b', 90, 0), block('c', 90, 90, 20)],
  lines: [],
  labels: [],
  arrows: [],
  least: [0, 0, 0],
  most: [100, 100, 30],
};
/** Point `p` moved by the column-major matrix `m`. */
const at = (m, [x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
const near = (a, b, why) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${why}: ${a} is not ${b}`));

// proves: projection_spatial
test("the drawing stands on a table at arm's length, its widest side as wide as the table", () => {
  const m = xrModel(SPACE);
  near(at(m, [50, 50, 0]), [0, ARM.height, -ARM.distance], 'the middle of the floor is on the table in front');
  near(at(m, [100, 50, 0]), [ARM.size / 2, ARM.height, -ARM.distance], 'across the page is across the table');
  assert.ok(at(m, [50, 0, 0])[2] < at(m, [50, 100, 0])[2], 'the page top is the far side');
  assert.ok(at(m, [50, 50, 30])[1] > ARM.height, 'things rise from the table');
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.deepEqual([...multiply(I, m)], [...m]);
  assert.deepEqual([...multiply(m, I)], [...m]);
});

// proves: projection_spatial
test('pointing at a thing picks the nearest box the ray meets, and none on a miss', () => {
  const m = xrModel(SPACE);
  const from = (p) => at(m, p);
  // standing past b's far side, looking back across the page: b is met before a
  const eye = from([120, 5, 5]),
    back = from([-20, 5, 5]);
  const way = back.map((v, i) => v - eye[i]);
  assert.equal(xrPick(SPACE, eye, way)?.id, 'b');
  // from above c, looking down
  const top = from([95, 95, 100]),
    down = from([95, 95, 0]);
  assert.equal(
    xrPick(
      SPACE,
      top,
      down.map((v, i) => v - top[i]),
    )?.id,
    'c',
  );
  // looking up and away from the table meets nothing
  assert.equal(xrPick(SPACE, [0, 1.6, 0], [0, 1, 0]), null);
  assert.equal(xrPick({ ...SPACE, blocks: [] }, eye, way), null);
});
