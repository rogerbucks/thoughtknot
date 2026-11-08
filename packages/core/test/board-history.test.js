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
});
