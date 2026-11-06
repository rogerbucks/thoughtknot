// board_quick_capture (editor spec §45): typing makes a sticky note. Enter makes the next one beside it. Tab makes a
// child joined to it. Nothing already on the board moves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { capture } from '../src/board-capture.ts';
import { itemBox } from '../src/board-svg.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'First'})`;

const apply = (text, changes) => changes.reduce((t, c) => boardEdit(t, c).text, text);
const board = () => readBoard(BOARD).board;
const first = () => board().items[0];

describe('board_quick_capture', () => {
  test('typing on an empty spot makes a sticky note there', () => {
    const r = capture(board(), 'spot', ' Hello ', null, [500, 400]);
    assert.ok(!('refused' in r));
    assert.equal(r.item.kind, 'Sticky');
    assert.equal(r.item.text, 'Hello');
    const b = itemBox(r.item);
    assert.equal(Math.round(b.x + b.w / 2), 500);
  });

  test('Enter makes the next note beside the last, never on top of another', () => {
    const r = capture(board(), 'next', 'Second', first(), [0, 0]);
    assert.ok(!('refused' in r));
    const a = itemBox(first());
    assert.ok(r.item.x >= a.x + a.w);
    const after = readBoard(apply(BOARD, r.changes)).board;
    assert.equal(after.items.length, 2);
    assert.equal(after.connectors.length, 0);
  });

  test('Tab makes a child below the last, joined to it', () => {
    const r = capture(board(), 'child', 'Why?', first(), [0, 0]);
    assert.ok(!('refused' in r));
    assert.ok(r.item.y >= itemBox(first()).h);
    const after = readBoard(apply(BOARD, r.changes)).board;
    assert.deepEqual(after.connectors, [{ from: 'a', to: r.item.id }]);
  });

  test('nothing already on the board moves', () => {
    const r = capture(board(), 'next', 'Second', first(), [0, 0]);
    const after = readBoard(apply(BOARD, r.changes)).board;
    assert.equal(after.items[0].x, 0);
    assert.equal(after.items[0].y, 0);
  });

  test('empty text, or a next with nothing before, catches nothing', () => {
    assert.ok('refused' in capture(board(), 'spot', '   ', null, [0, 0]));
    assert.ok('refused' in capture(board(), 'next', 'x', null, [0, 0]));
    assert.ok('refused' in capture(board(), 'child', 'x', null, [0, 0]));
  });

  test('each capture is said in words', () => {
    const r = capture(board(), 'child', 'Why?', first(), [0, 0]);
    assert.match(r.said, /Why\?/);
  });
});
