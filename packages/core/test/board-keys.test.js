// A board worked by the keyboard alone (editor spec §45, board_keyboard). Every item is reached, made, moved, sized,
// joined and taken out by keys. Each step is said, with the item's kind, text and connections. Arrows with nothing in
// focus pan; past the last item Tab leaves the board.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { boardKey, NO_CURSOR, PAN_STEP, STEP, BIG_STEP } from '../src/board-keys.ts';

const TEXT = `// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),
(k:Sticky {x: 10, y: 400, text: 'Fixed', locked: true}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`;
const BOARD = readBoard(TEXT).board;
const press = (key, more = {}) => ({ key, ...more });
const on = (id, linking = null) => ({ focus: id, linking });
const key = (cursor, k, more, readOnly) => boardKey(BOARD, cursor, press(k, more), [500, 500], readOnly);

describe('reaching items', () => {
  test('Tab goes through every item in reading order, and says each with its kind, text and connections', () => {
    const seen = [];
    let cursor = NO_CURSOR,
      step;
    while ((step = key(cursor, 'Tab'))) {
      seen.push(step.cursor.focus);
      cursor = step.cursor;
      if (step.cursor.focus === 'a')
        assert.match(step.said, /Sticky note: Go by train. leads to Card: Paris, leads to/);
    }
    assert.deepEqual(seen, ['a', 'b', 'k']);
  });

  test('Shift+Tab goes back, and past the first leaves the board', () => {
    assert.equal(key(on('b'), 'Tab', { shift: true }).cursor.focus, 'a');
    assert.equal(key(on('a'), 'Tab', { shift: true }), null);
    assert.equal(key(NO_CURSOR, 'Tab', { shift: true }).cursor.focus, 'k');
  });

  test('Escape lets go of the item in focus', () => {
    assert.deepEqual(key(on('a'), 'Escape').cursor, NO_CURSOR);
    assert.equal(key(NO_CURSOR, 'Escape'), null);
  });
});

describe('panning by keys', () => {
  test('an arrow with nothing in focus pans the view, the board the way a drag would take it', () => {
    assert.deepEqual(key(NO_CURSOR, 'ArrowRight').pan, [-PAN_STEP, -0]);
    assert.deepEqual(key(NO_CURSOR, 'ArrowUp').pan, [-0, PAN_STEP]);
  });

  test('works on a board that cannot be changed too', () => {
    assert.ok(key(NO_CURSOR, 'ArrowDown', {}, true).pan);
    assert.equal(key(on('a'), 'ArrowDown', {}, true), null);
    assert.equal(key(NO_CURSOR, 'n', {}, true), null);
  });

  test('leaves zoom keys and keys with Ctrl or Command to the host', () => {
    for (const k of ['+', '-', '0']) assert.equal(key(on('a'), k), null);
    assert.equal(key(on('a'), 'n', { ctrl: true }), null);
  });
});

describe('changing items', () => {
  test('an arrow moves the item in focus a step, Shift a bigger one, and says where', () => {
    const step = key(on('a'), 'ArrowRight');
    assert.deepEqual(step.change, { kind: 'move', id: 'a', x: 10 + STEP, y: 20 });
    assert.match(step.said, /Moved to 20, 20/);
    assert.deepEqual(key(on('a'), 'ArrowDown', { shift: true }).change, {
      kind: 'move',
      id: 'a',
      x: 10,
      y: 20 + BIG_STEP,
    });
  });

  test('Alt and an arrow size it, and say the size', () => {
    const step = key(on('b'), 'ArrowRight', { alt: true });
    assert.deepEqual(step.change, { kind: 'size', id: 'b', w: 160 + STEP, h: 90 });
    assert.match(step.said, /170 by 90/);
  });

  test('a locked item says it is locked, and nothing is written', () => {
    for (const k of ['ArrowLeft', 'Delete']) {
      const step = key(on('k'), k);
      assert.equal(step.change, undefined);
      assert.match(step.said, /locked/);
    }
  });

  test('N makes a sticky note beside the item in focus, puts focus on it and opens its text', () => {
    const step = key(on('a'), 'n');
    assert.equal(step.change.kind, 'add');
    assert.equal(step.change.item.kind, 'Sticky');
    assert.equal(step.cursor.focus, step.change.item.id);
    assert.equal(step.edit, step.change.item.id);
    assert.match(step.said, /New Sticky note/);
    assert.ok('text' in boardEdit(TEXT, step.change), 'the edit can be written');
  });

  test('N with nothing in focus makes it in the middle of the view', () => {
    const { item } = key(NO_CURSOR, 'N').change;
    assert.deepEqual([item.x + 80, item.y + 80], [500, 500]);
  });

  test('Enter opens the text of the item in focus', () => {
    assert.equal(key(on('b'), 'Enter').edit, 'b');
  });

  test('C on one item, then C on another, joins them, and says so', () => {
    const start = key(on('b'), 'c');
    assert.deepEqual(start.cursor, on('b', 'b'));
    assert.match(start.said, /Joining from Card: Paris/);
    const moved = key(start.cursor, 'Tab');
    assert.equal(moved.cursor.linking, 'b');
    assert.match(moved.said, /Press C/);
    const done = key(moved.cursor, 'c');
    assert.deepEqual(done.change, { kind: 'connect', from: 'b', to: 'k' });
    assert.deepEqual(done.cursor, on('k'));
    assert.match(done.said, /Card: Paris now leads to Sticky note: Fixed/);
  });

  test('Escape stops joining, focus kept', () => {
    assert.deepEqual(key(on('a', 'b'), 'Escape').cursor, on('a'));
  });

  test('joining two items already joined says so and writes nothing', () => {
    const step = key(on('b', 'a'), 'c');
    assert.equal(step.change, undefined);
    assert.match(step.said, /already joined/);
  });

  test('Delete takes the item in focus out and moves focus to the next', () => {
    const step = key(on('a'), 'Delete');
    assert.deepEqual(step.change, { kind: 'remove', id: 'a' });
    assert.equal(step.cursor.focus, 'b');
    assert.match(step.said, /Took out Sticky note: Go by train/);
  });
});
