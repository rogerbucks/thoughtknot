// The board's change log (editor spec §45, board_authorship). A change is recorded with its author. Undo takes back only
// that person's latest change, and says so in words when the board has moved on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { carryOut, logLines, record, undoPlan } from '../src/board-history.ts';

const START = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'})`;
const textOf = (text) => readBoard(text).board.items.find((i) => i.id === 'a').text;

describe('the change log', () => {
  test('records an author and undoes only that person’s change', () => {
    const after = boardEdit(START, { kind: 'text', id: 'a', text: 'Mine' }).text;
    const log = record([], START, after, 'ann', 1);
    assert.equal(logLines(log).length, 1);
    const plan = undoPlan(log, after, 'ann');
    assert.ok('changes' in plan);
    assert.equal(textOf(carryOut(after, plan).text), 'One');
  });

  test('says there is nothing to undo for someone who changed nothing', () => {
    const after = boardEdit(START, { kind: 'text', id: 'a', text: 'Mine' }).text;
    const plan = undoPlan(record([], START, after, 'ann', 1), after, 'bob');
    assert.ok('refused' in plan);
  });

  test('undo sets back only what changed on an item, so the rest of the block stays as written', () => {
    // b is written with room a writer of the whole board would close up
    const hand = `${START},\n(b:Card {x: 300,   y: 20, text: 'Two'}),\n(c:Sticky {x: 0, y: 400})`;
    const undone = (change) => {
      const after = boardEdit(hand, change).text;
      const plan = undoPlan(record([], hand, after, 'ann', 1), after, 'ann');
      return { plan, text: carryOut(after, plan).text };
    };
    const moved = undone({ kind: 'move', id: 'a', x: 50, y: 60 });
    assert.deepEqual(moved.plan.changes, [{ kind: 'move', id: 'a', x: 0, y: 0 }]);
    assert.equal(moved.text, hand, 'not one byte differs from the block before the move');
    assert.equal(undone({ kind: 'text', id: 'a', text: 'Mine' }).text, hand);
    assert.equal(undone({ kind: 'lock', id: 'a', locked: true }).text, hand);
    // several items moved at once go back as one edit
    const many = undone({
      kind: 'moves',
      moves: [
        { id: 'a', x: 5, y: 5 },
        { id: 'c', x: 9, y: 9 },
      ],
    });
    assert.deepEqual(many.plan.changes, [
      {
        kind: 'moves',
        moves: [
          { id: 'c', x: 0, y: 400 },
          { id: 'a', x: 0, y: 0 },
        ],
      },
    ]);
    assert.equal(many.text, hand);
    // an item sized for the first time had no size to set back, so the whole item is put back
    const sized = undone({ kind: 'size', id: 'c', w: 90, h: 90 });
    assert.equal(sized.plan.changes[0].kind, 'put');
    assert.doesNotMatch(sized.text, /\(c:Sticky \{[^}]*w:/);
  });
});
