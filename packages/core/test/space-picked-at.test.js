// Where the thing picked in space is on the screen (editor spec §72, edit_every_view). The view tells its card as the
// picked thing moves on the screen, so the editor beside it follows it. A still frame tells nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_PICKED_AT, tellPickedAt } from '../src/display/graph-view/space-picked-at.ts';

/** The camera's matrix that shows the space as it is: x and y from -1 to 1 across the screen. */
const SAME = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const block = (x) => ({ id: 'b', style: 'thing', of: 'q', x, y: 0, width: 0, depth: 0, floor: 0, tall: 0 });

describe('the picked thing told on the screen', () => {
  // proves: edit_every_view
  test('says where it moves to, once per move, and none once nothing is picked', () => {
    const root = new EventTarget(),
      heard = [];
    root.addEventListener(SPACE_PICKED_AT, (e) => heard.push(e.detail));
    tellPickedAt(root, block(0), SAME, 200, 100);
    tellPickedAt(root, block(0), SAME, 200, 100);
    tellPickedAt(root, block(0.5), SAME, 200, 100);
    tellPickedAt(root, null, SAME, 200, 100);
    assert.deepEqual(heard, [{ key: 'q', x: 100, y: 50 }, { key: 'q', x: 150, y: 50 }, null]);
  });
});
