// Dragging a board's items (editor spec ES§45, board_handles). A drag by the body moves the item and snaps it into
// line, with guides drawn while it goes. A drag by the handle sizes it. Alt places it freely. A press that never moves
// is a tap. The handle is drawn on the item in focus only, and never on a locked one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { boardSvg } from '../src/board-svg.ts';
import { PALETTES } from '../src/palette.ts';
import { BoardDrag, drawHandle } from '../src/display/board/board-drag.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Shape {x: 0, y: 0, w: 100, h: 100}),
(b:Shape {x: 400, y: 300, w: 100, h: 100}),
(c:Shape {x: 800, y: 0, w: 100, h: 100, locked: true})`).board;

/** The board drawn in a page, as its picture. */
function picture() {
  const { window } = new JSDOM(`<body>${boardSvg(BOARD, PALETTES.light)}</body>`);
  return window.document.querySelector('svg');
}

describe('a drag on a board', () => {
  // proves: board_handles
  test('by the body moves the item, snapped into line, and draws the guide only while it goes', () => {
    const svg = picture(),
      drag = new BoardDrag();
    drag.start(1, 'b', { x: 0, y: 0 }, false);
    assert.ok(drag.move(BOARD, svg, 1, { x: -396, y: 10 }, 1, false));
    assert.equal(svg.querySelector('[data-item="b"]').getAttribute('transform'), 'translate(-400 10)');
    assert.equal(svg.querySelectorAll('.thoughtknot-board-guide').length, 1, 'the guide it snapped to');
    const done = drag.lift(BOARD, svg, 1, { x: -396, y: 10 }, 1, false);
    assert.deepEqual(done.change, { kind: 'move', id: 'b', x: 0, y: 310 });
    assert.equal(svg.querySelectorAll('.thoughtknot-board-guide').length, 0, 'gone once it lands');
  });

  // proves: board_handles
  test('with Alt places it freely, with no snap', () => {
    const drag = new BoardDrag();
    drag.start(1, 'b', { x: 0, y: 0 }, false);
    drag.move(BOARD, picture(), 1, { x: -396, y: 10 }, 1, true);
    assert.deepEqual(drag.lift(BOARD, null, 1, { x: -396, y: 10 }, 1, true).change, {
      kind: 'move',
      id: 'b',
      x: 4,
      y: 310,
    });
  });

  // proves: board_handles
  test('by the handle sizes the item, never smaller than can be pointed at, at the zoom of the view', () => {
    const drag = new BoardDrag();
    drag.start(1, 'a', { x: 0, y: 0 }, true);
    drag.move(BOARD, picture(), 1, { x: 100, y: 50 }, 2, false);
    const done = drag.lift(BOARD, null, 1, { x: 100, y: 50 }, 2, false);
    assert.deepEqual(done.change, { kind: 'size', id: 'a', w: 150, h: 125 });
    drag.start(2, 'a', { x: 0, y: 0 }, true);
    drag.move(BOARD, null, 2, { x: -500, y: -500 }, 1, false);
    assert.equal(drag.lift(BOARD, null, 2, { x: -500, y: -500 }, 1, false).change.w, 20);
  });

  // proves: board_handles
  test('that never moves is a tap, and another pointer’s lift is not this drag', () => {
    const drag = new BoardDrag();
    drag.start(1, 'a', { x: 0, y: 0 }, false);
    assert.equal(drag.lift(BOARD, null, 2, { x: 50, y: 50 }, 1, false), null);
    assert.ok(drag.active);
    assert.deepEqual(drag.lift(BOARD, null, 1, { x: 1, y: 1 }, 1, false), { tap: 'a' });
    assert.ok(!drag.active);
  });

  // proves: board_handles
  test('the handle is drawn on the item in focus, at its lower right corner, and never on a locked item', () => {
    const svg = picture();
    drawHandle(svg, BOARD, 'a');
    const h = svg.querySelector('[data-item="a"] [data-handle="a"]');
    assert.ok(h);
    assert.equal(Number(h.getAttribute('x')) + Number(h.getAttribute('width')) / 2, 100);
    drawHandle(svg, BOARD, 'c');
    assert.equal(svg.querySelector('[data-handle="c"]'), null);
    drawHandle(svg, BOARD, null);
    assert.equal(svg.querySelectorAll('[data-handle]').length, 1);
  });
});
