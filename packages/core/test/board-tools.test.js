// The tools of a board, on screen (editor spec ES§45, board_tools). A making tool puts a new item where the person
// pressed, never over another. Hand only pans. Connect joins the two items pressed. Choose leaves the board as it was.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { itemBox } from '../src/board-svg.ts';
import { BOARD_TOOLS, madeAt, opensText, toolMakes, toolPress } from '../src/board-tools.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 300, y: 0, text: 'Paris'}),
(f:Frame {x: -100, y: -100, w: 800, h: 600, layer: -1, text: 'Travel'})`).board;

const overlaps = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

describe('the tools of a board', () => {
  // proves: board_tools
  test('start with Choose and Hand, then a tool for each kind made by a press, then Connect', () => {
    assert.deepEqual(BOARD_TOOLS, [
      'choose',
      'hand',
      'sticky',
      'text',
      'shape',
      'frame',
      'view',
      'connect',
      'pen',
      'highlighter',
      'eraser',
    ]);
    assert.equal(toolMakes('sticky'), 'Sticky');
    assert.equal(toolMakes('frame'), 'Frame');
    assert.equal(toolMakes('choose'), null);
    assert.equal(toolMakes('connect'), null);
    assert.ok(opensText('Sticky') && opensText('Text') && !opensText('Shape'));
  });

  // proves: board_tools
  test('make an item with its middle where the person pressed, with a free id', () => {
    const item = madeAt(BOARD, 'Sticky', [1000, 1000]);
    const box = itemBox(item);
    assert.equal(item.kind, 'Sticky');
    assert.equal(item.id, 'sticky1');
    assert.deepEqual([box.x + box.w / 2, box.y + box.h / 2], [1000, 1000]);
    assert.ok(Number.isInteger(item.x) && Number.isInteger(item.y), 'places are whole numbers');
  });

  // proves: board_tools
  test('never put a new item over another: it goes just below, and nothing else moves', () => {
    const item = madeAt(BOARD, 'Sticky', [80, 80]);
    for (const other of BOARD.items.filter((i) => i.kind !== 'Frame'))
      assert.ok(!overlaps(itemBox(item), itemBox(other)), `clear of ${other.id}`);
    assert.ok(item.y > 0, 'moved down from the spot pressed');
    assert.equal(BOARD.items[0].x, 0, 'the item that was there stays put');
  });

  // proves: board_tools
  test('put a new frame behind every other item, as it is made to hold them', () => {
    const frame = madeAt(BOARD, 'Frame', [0, 0]);
    assert.ok(frame.layer < -1, 'below the lowest layer');
  });

  // proves: board_tools
  test('Hand pans even on an item; Choose leaves the press to the board', () => {
    assert.deepEqual(toolPress(BOARD, 'hand', 'a', [0, 0], null), { kind: 'pan' });
    assert.deepEqual(toolPress(BOARD, 'choose', 'a', [0, 0], null), { kind: 'pass' });
  });

  // proves: board_tools
  test('Connect joins the first item pressed to the second, and an empty spot lets go', () => {
    assert.deepEqual(toolPress(BOARD, 'connect', 'a', [0, 0], null), { kind: 'from', id: 'a' });
    assert.deepEqual(toolPress(BOARD, 'connect', 'a', [0, 0], 'a'), { kind: 'from', id: 'a' });
    assert.deepEqual(toolPress(BOARD, 'connect', 'b', [0, 0], 'a'), { kind: 'join', from: 'a', to: 'b' });
    assert.deepEqual(toolPress(BOARD, 'connect', null, [0, 0], 'a'), { kind: 'stop' });
  });

  // proves: board_tools
  test('make nothing on a board that may only be looked at', () => {
    assert.deepEqual(toolPress(BOARD, 'sticky', null, [0, 0], null, true), { kind: 'pass' });
    assert.deepEqual(toolPress(BOARD, 'connect', 'a', [0, 0], null, true), { kind: 'pass' });
    assert.deepEqual(toolPress(BOARD, 'hand', 'a', [0, 0], null, true), { kind: 'pan' });
  });
});
