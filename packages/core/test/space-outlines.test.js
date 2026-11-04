// Things in space as the camera sees them (editor spec §68, level_space): space-outlines.ts. Each thing gets its box on
// the screen, wider the nearer it is, and a thing behind the camera gets none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenBoxes } from '../src/space-outlines.ts';

// a camera at the origin looking along z: a point's depth is its z, and x and y pass through
const matrix = new Float32Array(16);
matrix[0] = 1;
matrix[5] = 1;
matrix[11] = 1;
const block = (of, z) => ({ of, x: -1, y: -0.5, width: 2, depth: 1, floor: z - 0.5, tall: 1 });

// proves: level_space
test('each thing gets its box on the screen, bigger when nearer, and none behind the camera', () => {
  const boxes = screenBoxes({ blocks: [block('near', 2), block('far', 8), block('behind', -3)] }, matrix, 800, 600);
  assert.deepEqual([...boxes.keys()], ['near', 'far']);
  const near = boxes.get('near'),
    far = boxes.get('far');
  assert.equal((near.left + near.right) / 2, 400, 'straight ahead is the middle of the screen');
  assert.equal((near.top + near.bottom) / 2, 300);
  assert.ok(near.right - near.left > 3 * (far.right - far.left), 'nearer is bigger');
});
