// Snapping a dragged item into line (editor spec ES§45, board_handles). Within the slack its edge or middle lines up
// with another item's, and the line is given back as a guide. Out of it, the item goes where it was dropped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { snapPlace } from '../src/board-snap.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Shape {x: 0, y: 0, w: 100, h: 100}),
(b:Shape {x: 400, y: 300, w: 100, h: 100})`).board;

describe('a dragged item', () => {
  // proves: board_handles
  test('lines its left up with another item’s left when near it, and says where', () => {
    const r = snapPlace(BOARD, 'b', 4, 300, 6);
    assert.equal(r.x, 0);
    assert.equal(r.y, 300, 'nothing near across, so it stays as dropped');
    assert.deepEqual(r.guides, [{ x: 0 }]);
  });

  // proves: board_handles
  test('lines its middle up with another item’s middle, across and down at once', () => {
    const r = snapPlace(BOARD, 'b', 3, -4, 6);
    assert.deepEqual([r.x, r.y], [0, 0]);
    assert.equal(r.guides.length, 2);
  });

  // proves: board_handles
  test('goes where it was dropped, in whole numbers, when no line is near', () => {
    const r = snapPlace(BOARD, 'b', 250.4, 180.6, 6);
    assert.deepEqual([r.x, r.y, r.guides], [250, 181, []]);
  });

  // proves: board_handles
  test('never lines up with itself or with the items moving with it', () => {
    const r = snapPlace(BOARD, 'b', 3, 300, 6, ['a']);
    assert.deepEqual([r.x, r.guides], [3, []]);
  });
});
