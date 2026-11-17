// Where a board's view goes to bring items into sight (editor spec §45, board_arranged_by_graph; never disorient).
// It stays where it is when they are in sight. Else it moves the least it can, or zooms out just far enough.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aimAt, EDGE } from '../src/display/board/board-aim.ts';

const SIZE = { width: 600, height: 420 };
const FRAME = { x: -100, y: -100, w: 4000, h: 3000 };
const box = (x, y, w = 100, h = 100) => ({ x, y, w, h });
/** Where a box is in the viewport at a view, in pixels: left, top, right, bottom. */
const shown = (b, v) => [
  v.x + (b.x - FRAME.x) * v.scale,
  v.y + (b.y - FRAME.y) * v.scale,
  v.x + (b.x + b.w - FRAME.x) * v.scale,
  v.y + (b.y + b.h - FRAME.y) * v.scale,
];
const inSight = (b, v) => {
  const [l, t, r, f] = shown(b, v);
  return l >= 0 && t >= 0 && r <= SIZE.width + 1e-9 && f <= SIZE.height + 1e-9;
};

describe('the view after items are arranged', () => {
  test('stays where it is when every item is in sight, even at the very edge', () => {
    const now = { scale: 1, x: 100, y: 100 };
    assert.equal(aimAt(now, SIZE, FRAME, [box(-100, -100), box(300, 100)]), null);
    assert.equal(aimAt(now, SIZE, FRAME, []), null);
  });

  test('moves the least it can, at the same zoom, when an item is out of sight and all can fit', () => {
    const now = { scale: 1, x: 100, y: 100 };
    const boxes = [box(-266, 0), box(100, 100)]; // the first is 66 px off the left edge
    const to = aimAt(now, SIZE, FRAME, boxes);
    assert.equal(to.scale, 1, 'the zoom is kept');
    assert.equal(to.y, now.y, 'it does not move up or down: nothing was out of sight that way');
    assert.equal(shown(boxes[0], to)[0], EDGE, 'the item is just inside the left edge');
    assert.ok(boxes.every((b) => inSight(b, to)));
  });

  test('zooms out just far enough, with the items in the middle, when they cannot all fit at this zoom', () => {
    const now = { scale: 1, x: 0, y: 0 };
    const boxes = [box(0, 0), box(1900, 900)];
    const to = aimAt(now, SIZE, FRAME, boxes);
    assert.ok(to.scale < 1 && to.scale > 0.2, `zoomed out to ${to.scale}`);
    assert.ok(boxes.every((b) => inSight(b, to)));
    const [l, , r] = [shown(boxes[0], to)[0], 0, shown(boxes[1], to)[2]];
    assert.ok(Math.abs(l - (SIZE.width - r)) < 1e-6, 'as much room left as right');
  });
});
