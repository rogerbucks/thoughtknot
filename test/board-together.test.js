// Boards worked on together (editor spec §45). board_authorship: each change is logged with its author, and undo
// reverts only the undoer's own changes. board_offline_merge: edits made apart merge with nothing lost, and a clash
// keeps both sides and is flagged.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../packages/core/src/board.ts';
import { boardEdit } from '../packages/core/src/board-edit.ts';
import { CLASH, mergeBoards } from '../packages/core/src/board-merge.ts';
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
      ['Ann', { kind: 'text', id: 'a', text: 'Mine' }],
      ['Bea', { kind: 'text', id: 'b', text: 'Second' }],
      ['Ann', { kind: 'text', id: 'a', text: 'Later' }],
    ]);
    for (const expect of ['Mine', 'One']) {
      const plan = undoPlan(log, text, 'Ann');
      assert.ok(!('refused' in plan));
      text = carryOut(text, plan).text;
      log = markUndone(log, plan.entry.n);
      assert.equal(item(text, 'a').text, expect);
    }
    assert.match(undoPlan(log, text, 'Ann').refused, /nothing of yours/);
    assert.equal(item(text, 'b').text, 'Second');
  });

  test('a lock can be undone by the person who made it, and others’ locks cannot', () => {
    const mine = session([['Ann', { kind: 'lock', id: 'a', locked: true }]]);
    assert.equal(item(mine.text, 'a').locked, true);
    const back = carryOut(mine.text, undoPlan(mine.log, mine.text, 'Ann'));
    assert.ok('text' in back);
    assert.equal(item(back.text, 'a').locked, undefined);
    const theirs = session([
      ['Ann', { kind: 'text', id: 'a', text: 'Mine' }],
      ['Bea', { kind: 'lock', id: 'a', locked: true }],
    ]);
    assert.match(undoPlan(theirs.log, theirs.text, 'Ann').refused, /Someone else/);
  });

  test('an item made and locked in one go can still be taken out by its maker', () => {
    const made = session([
      ['Ann', { kind: 'add', item: { id: 'c', kind: 'Sticky', x: 400, y: 0, locked: true, more: {} } }],
    ]);
    const back = carryOut(made.text, undoPlan(made.log, made.text, 'Ann'));
    assert.ok('text' in back);
    assert.equal(item(back.text, 'c'), undefined);
  });

  test('a link someone else has since re-made or taken out is a clash, said as one', () => {
    const base = session([['Ann', { kind: 'connect', from: 'a', to: 'b' }]]);
    const gone = boardEdit(base.text, { kind: 'disconnect', from: 'a', to: 'b' }).text;
    assert.match(undoPlan(base.log, gone, 'Ann').refused, /Someone else/);
    const withLabel = session([
      ['Ann', { kind: 'connect', from: 'a', to: 'b' }],
      ['Ann', { kind: 'disconnect', from: 'a', to: 'b' }],
    ]);
    const remade = boardEdit(withLabel.text, { kind: 'connect', from: 'a', to: 'b', label: 'Bea’s' }).text;
    assert.match(undoPlan(withLabel.log, remade, 'Ann').refused, /Someone else/);
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

describe('board_offline_merge', () => {
  const edit = (text, ...changes) => changes.reduce((t, c) => boardEdit(t, c).text, text);
  const items = (text) => readBoard(text).board.items;

  test('changes made apart to different items are all kept', () => {
    const ours = edit(START, { kind: 'move', id: 'a', x: 5, y: 5 });
    const theirs = edit(START, { kind: 'text', id: 'b', text: 'Second' });
    const m = mergeBoards(START, ours, theirs);
    assert.deepEqual(m.clashes, []);
    assert.deepEqual([item(m.text, 'a').x, item(m.text, 'b').text], [5, 'Second']);
  });

  test('different properties of one item are both kept, with no clash', () => {
    const m = mergeBoards(
      START,
      edit(START, { kind: 'move', id: 'a', x: 7, y: 7 }),
      edit(START, { kind: 'text', id: 'a', text: 'Uno' }),
    );
    assert.deepEqual(m.clashes, []);
    assert.deepEqual([item(m.text, 'a').x, item(m.text, 'a').text], [7, 'Uno']);
  });

  test('a clash keeps both sides and flags both, and says so', () => {
    const m = mergeBoards(
      START,
      edit(START, { kind: 'text', id: 'a', text: 'Mine' }),
      edit(START, { kind: 'text', id: 'a', text: 'Yours' }),
    );
    assert.equal(m.clashes.length, 1);
    assert.equal(item(m.text, 'a').text, 'Mine');
    const copy = items(m.text).find((i) => i.text === 'Yours');
    assert.ok(copy, 'the other side is kept');
    assert.equal(item(m.text, 'a').more[CLASH], copy.id);
    assert.equal(copy.more[CLASH], 'a');
    assert.match(m.said, /1 clashes|flagged/);
    assert.deepEqual(readBoard(m.text).problems, []);
  });

  test('the copy beside a clash does not sit on the item it clashed with', () => {
    const m = mergeBoards(
      START,
      edit(START, { kind: 'text', id: 'a', text: 'Mine' }),
      edit(START, { kind: 'text', id: 'a', text: 'Yours' }),
    );
    const [a, copy] = [item(m.text, 'a'), items(m.text).find((i) => i.text === 'Yours')];
    assert.ok(copy.x >= a.x + 160);
  });

  test('an item both sides made is kept, and an item both sides took out is gone', () => {
    const add = (id, text) => ({ kind: 'add', item: { id, kind: 'Sticky', x: 900, y: 0, text, more: {} } });
    const m = mergeBoards(
      START,
      edit(START, add('c', 'From me'), { kind: 'remove', id: 'b' }),
      edit(START, add('d', 'From you'), { kind: 'remove', id: 'b' }),
    );
    assert.deepEqual(
      items(m.text)
        .map((i) => i.id)
        .sort(),
      ['a', 'c', 'd'],
    );
    assert.deepEqual(m.clashes, []);
  });

  test('an item one side took out and the other changed is kept and flagged, never lost', () => {
    const m = mergeBoards(
      START,
      edit(START, { kind: 'remove', id: 'a' }),
      edit(START, { kind: 'text', id: 'a', text: 'Changed' }),
    );
    assert.equal(item(m.text, 'a').text, 'Changed');
    assert.equal(m.clashes[0].why, 'removed');
    assert.ok(CLASH in item(m.text, 'a').more);
  });

  test('a link one side made is kept; a link one side took out goes when the other left it', () => {
    const linked = edit(START, { kind: 'connect', from: 'a', to: 'b' });
    const m1 = mergeBoards(START, linked, START);
    assert.equal(readBoard(m1.text).board.connectors.length, 1);
    const m2 = mergeBoards(linked, START, linked);
    assert.equal(readBoard(m2.text).board.connectors.length, 0);
  });

  test('merging the same version twice, or with nothing changed, changes nothing', () => {
    const m = mergeBoards(START, START, START);
    assert.deepEqual(m.clashes, []);
    assert.equal(readBoard(m.text).board.items.length, 2);
    const once = edit(START, { kind: 'move', id: 'a', x: 3, y: 3 });
    assert.equal(mergeBoards(START, once, once).clashes.length, 0);
  });
});
