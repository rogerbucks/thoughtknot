// Where things are on a board's screen (editor spec ES§45, board_view). A host that draws a board afresh after each
// write builds it off the page, where it has no width yet. It must then be taken as wide as the board was. So the
// view kept from before is put back as it was, and nothing jumps (never disorient).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BoardSpace, HEIGHT } from '../src/display/board/board-space.ts';

const viewport = (width) => ({ getBoundingClientRect: () => ({ width, left: 10, top: 20 }) });
const zoom = () => ({ view: () => ({ scale: 0.5, x: 30, y: 40 }) });
const frame = () => ({ x: -100, y: 0, w: 700, h: 340 });

describe('the space of a board', () => {
  // proves: board_view
  test('a board not yet on the page is as wide as the last board measured, not a width made up', () => {
    assert.deepEqual(new BoardSpace(viewport(455), zoom, frame).size(), { width: 455, height: HEIGHT });
    assert.deepEqual(new BoardSpace(viewport(0), zoom, frame).size(), { width: 455, height: HEIGHT });
    assert.equal(new BoardSpace(viewport(820), zoom, frame).size().width, 820, 'a measured width always wins');
  });

  // proves: board_view
  test('a spot of the viewport is given in board units, through the pan, the zoom and the frame', () => {
    const space = new BoardSpace(viewport(455), zoom, frame);
    assert.deepEqual(space.point({ clientX: 110, clientY: 120 }), { x: 100, y: 100 });
    assert.deepEqual(space.onBoard({ x: 100, y: 100 }), [40, 120]);
  });
});
