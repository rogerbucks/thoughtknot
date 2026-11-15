// Boards inside boards (editor spec §45, board_nested). A view that names a board shows it. A zoom in on it goes on
// into that board once it fills most of the view. The inner board opens just where its picture was.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readBoard } from '../src/board.ts';
import { ENTER_FILL, entering, nestedBoardOf, placeInside } from '../src/board-nest.ts';
import { boardFrame } from '../src/board-svg.ts';

const BOARD = readBoard(
  [
    '// graph: ideas · BOARD',
    "(a:Sticky {x: 0, y: 0, text: 'Go'}),",
    "(v:View {x: 200, y: 0, w: 400, h: 300, board: 'plan'}),",
    "(g:View {x: 200, y: 400, w: 400, h: 300, view: 'matrix'})",
  ].join('\n'),
).board;
const FRAME = boardFrame(BOARD);
const SIZE = { width: 600, height: 420 };
const item = (id) => BOARD.items.find((i) => i.id === id);

// proves: board_nested
test('only a view that names a board is a board inside this one', () => {
  assert.equal(nestedBoardOf(item('v')), 'plan');
  assert.equal(nestedBoardOf(item('g')), null, 'a view of a graph is not');
  assert.equal(nestedBoardOf(item('a')), null);
});

// proves: board_nested
test('a zoom in goes on into the board under the pointer only once its picture fills most of the view', () => {
  const small = { scale: 1, x: 0, y: 0 };
  assert.equal(entering(BOARD, FRAME, small, SIZE, { x: 300, y: 100 }), null, '400 wide is under most of 600');
  const scale = (SIZE.width * ENTER_FILL) / 400;
  const big = { scale, x: -200 * scale, y: 0 };
  assert.deepEqual(entering(BOARD, FRAME, big, SIZE, { x: 100, y: 100 }), { id: 'v', name: 'plan' });
  assert.equal(entering(BOARD, FRAME, big, SIZE, { x: 100, y: 410 }), null, 'the pointer is off the view of the board');
  const onGraph = { scale: 2, x: -400, y: -800 };
  assert.equal(entering(BOARD, FRAME, onGraph, SIZE, { x: 100, y: 100 }), null, 'a view of a graph is never entered');
});

// proves: board_nested
test('the inner board opens whole in the middle of the room its picture had, so nothing jumps', () => {
  const view = { scale: 2, x: -400, y: 10 };
  const room = { x: 206, y: 22, w: 388, h: 272 };
  const to = placeInside(room, FRAME, view, { x: 0, y: 0, w: 194, h: 68 });
  assert.equal(to.scale, 4, 'as wide as its room: 776 pixels over 194');
  assert.equal(to.x, 12, 'the left of its room');
  assert.equal(to.y, 54 + (544 - 272) / 2, 'in the middle of its room, top to bottom');
});
