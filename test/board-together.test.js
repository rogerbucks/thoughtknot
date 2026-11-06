// Boards worked on together (editor spec §45). board_authorship: each change is logged with its author, and undo
// reverts only the undoer's own changes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../packages/core/src/board.ts';
import { boardEdit } from '../packages/core/src/board-edit.ts';
import { carryOut, logLines, markUndone, record, undoPlan } from '../packages/core/src/board-history.ts';

const START = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'}),
(b:Sticky {x: 200, y: 0, text: 'Two'})`;

/** A board with changes made in turn by named people: each `[person, change]` is applied and logged. */
function session(steps) {
  let text = START;
  let log = [];
  steps.forEach(([by, change], i) => {
    const r = boardEdit(text, change);
    assert.ok('text' in r, JSON.stringify(r));
    log = record(log, text, r.text, by, 1000 + i);
    text = r.text;
  });
  return { text, log };
}
const item = (text, id) => readBoard(text).board.items.find((i) => i.id === id);

describe('board_authorship', () => {
  test('each change is logged with its author, in order', () => {
    const { log } = session([
      ['Ann', { kind: 'move', id: 'a', x: 10, y: 10 }],
      ['Bea', { kind: 'text', id: 'b', text: 'Second' }],
    ]);
    assert.deepEqual(
      log.map((e) => [e.n, e.by]),
      [
        [1, 'Ann'],
        [2, 'Bea'],
      ],
    );
    assert.match(logLines(log)[1], /Bea/);
  });

  test('a change that changes nothing is not logged', () => {
    const { log } = session([['Ann', { kind: 'move', id: 'a', x: 0, y: 0 }]]);
    assert.equal(log.length, 0);
  });

  test('undo takes back the undoer’s own change', () => {
    const { text, log } = session([['Ann', { kind: 'move', id: 'a', x: 10, y: 10 }]]);
    const plan = undoPlan(log, text, 'Ann');
    assert.ok(!('refused' in plan));
    const back = carryOut(text, plan);
    assert.deepEqual([item(back.text, 'a').x, item(back.text, 'a').y], [0, 0]);
  });

  test('undo leaves another person’s changes alone', () => {
    const { text, log } = session([
      ['Ann', { kind: 'move', id: 'a', x: 10, y: 10 }],
      ['Bea', { kind: 'text', id: 'b', text: 'Second' }],
    ]);
    const back = carryOut(text, undoPlan(log, text, 'Ann'));
    assert.equal(item(back.text, 'b').text, 'Second');
    assert.equal(item(back.text, 'a').x, 0);
  });

  test('undo is refused, and says so, when someone has changed the same item since', () => {
    const { text, log } = session([
      ['Ann', { kind: 'move', id: 'a', x: 10, y: 10 }],
      ['Bea', { kind: 'move', id: 'a', x: 99, y: 99 }],
    ]);
    const plan = undoPlan(log, text, 'Ann');
    assert.match(plan.refused, /Someone else/);
    assert.equal(item(text, 'a').x, 99);
  });

  test('undo goes back through a person’s own changes, newest first, once each', () => {
    let { text, log } = session([
      ['Ann', { kind: 'move', id: 'a', x: 10, y: 10 }],
      ['Bea', { kind: 'text', id: 'b', text: 'Second' }],
      ['Ann', { kind: 'text', id: 'a', text: 'Mine' }],
    ]);
    for (const expect of ['One', 'One']) {
      const plan = undoPlan(log, text, 'Ann');
      if ('refused' in plan) break;
      text = carryOut(text, plan).text;
      log = markUndone(log, plan.entry.n);
      assert.equal(item(text, 'a').text, expect);
    }
    assert.equal(item(text, 'a').x, 0);
    assert.match(undoPlan(log, text, 'Ann').refused, /nothing of yours/);
    assert.equal(item(text, 'b').text, 'Second');
  });

  test('an item made is taken out, and an item taken out is brought back with its links', () => {
    const made = session([
      ['Ann', { kind: 'add', item: { id: 'c', kind: 'Sticky', x: 400, y: 0, text: 'New', more: {} } }],
      ['Ann', { kind: 'connect', from: 'a', to: 'c' }],
    ]);
    let back = carryOut(made.text, undoPlan(made.log, made.text, 'Ann'));
    assert.equal(readBoard(back.text).board.connectors.length, 0);
    assert.ok(item(back.text, 'c'));
    const gone = session([
      ['Ann', { kind: 'connect', from: 'a', to: 'b' }],
      ['Bea', { kind: 'remove', id: 'b' }],
    ]);
    back = carryOut(gone.text, undoPlan(gone.log, gone.text, 'Bea'));
    assert.ok(item(back.text, 'b'));
    assert.deepEqual(
      readBoard(back.text).board.connectors.map((c) => [c.from, c.to]),
      [['a', 'b']],
    );
  });
});
